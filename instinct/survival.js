// ClawCraft - Survival Instinct
// Automatic: eat when hungry, flee when low health, seek shelter at night
// No LLM needed - pure reactive behavior

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Instinct:Survival');

const HUNGER_THRESHOLD = 14;
const CRITICAL_HUNGER = 6;
const LOW_HEALTH = 8;
const CRITICAL_HEALTH = 4;

export function createSurvivalInstinct(bot, bus) {
  let isEating = false;
  let isFleeing = false;
  let isSheltering = false;

  function evaluate() {
    evaluateHunger();
    evaluateHealth();
    evaluateNightSafety();
  }

  function evaluateHunger() {
    if (isEating) return;

    const food = bot.food;
    if (food > HUNGER_THRESHOLD) return;

    const foodItem = findBestFood();
    if (!foodItem) {
      if (food <= CRITICAL_HUNGER) {
        bus.emit('instinct:needFood', { food, urgent: true }, EventCategory.HEALTH);
        log.warn(`Critically hungry (${food}/20) and no food!`);
      }
      return;
    }

    isEating = true;
    log.info(`Eating ${foodItem.name} (hunger: ${food}/20)`);

    bot.equip(foodItem, 'hand')
      .then(() => bot.consume())
      .then(() => {
        isEating = false;
        bus.emit('instinct:ate', { item: foodItem.name, food: bot.food }, EventCategory.HEALTH);
      })
      .catch((err) => {
        isEating = false;
        log.error(`Failed to eat: ${err.message}`);
      });
  }

  function evaluateHealth() {
    const health = bot.health;

    if (health <= CRITICAL_HEALTH && !isFleeing) {
      isFleeing = true;
      log.warn(`Critical health (${health}/20)! Fleeing!`);

      bus.emit('instinct:flee', { health, reason: 'critical_health' }, EventCategory.COMBAT);

      // Try to run away from nearest hostile
      const hostile = findNearestHostile();
      if (hostile) {
        fleeFrom(hostile.position);
      }

      setTimeout(() => { isFleeing = false; }, 5000);
    }

    if (health <= LOW_HEALTH) {
      // Try to use healing items
      const healingItem = findHealingItem();
      if (healingItem) {
        bot.equip(healingItem, 'hand')
          .then(() => bot.consume())
          .catch(() => {});
      }
    }
  }

  function evaluateNightSafety() {
    const timeOfDay = bot.time.timeOfDay;
    const isNight = timeOfDay >= 13000 && timeOfDay <= 23000;

    if (!isNight || isSheltering) return;

    // Check if we're exposed (no solid block above within 4 blocks)
    const pos = bot.entity.position;
    let hasShelter = false;
    for (let y = 1; y <= 4; y++) {
      const above = bot.blockAt(pos.offset(0, y, 0));
      if (above && above.boundingBox === 'block') {
        hasShelter = true;
        break;
      }
    }

    if (!hasShelter) {
      bus.emit('instinct:needShelter', {
        timeOfDay,
        position: pos,
      }, EventCategory.WORLD);
    }
  }

  function findBestFood() {
    const foodValues = {
      cooked_beef: 8, cooked_porkchop: 8, golden_carrot: 6,
      cooked_salmon: 6, cooked_mutton: 6, cooked_chicken: 6,
      cooked_rabbit: 5, baked_potato: 5, bread: 5,
      cooked_cod: 5, beetroot_soup: 6, mushroom_stew: 6,
      golden_apple: 4, apple: 4, carrot: 3,
      melon_slice: 2, sweet_berries: 2, dried_kelp: 1,
    };

    const items = bot.inventory.items();
    let bestFood = null;
    let bestValue = 0;

    for (const item of items) {
      const value = foodValues[item.name];
      if (value && value > bestValue) {
        bestFood = item;
        bestValue = value;
      }
    }

    return bestFood;
  }

  function findHealingItem() {
    const healingItems = new Set([
      'golden_apple', 'enchanted_golden_apple',
      'potion', 'splash_potion',
    ]);

    return bot.inventory.items().find(item => healingItems.has(item.name));
  }

  function findNearestHostile() {
    const pos = bot.entity.position;
    let nearest = null;
    let nearestDist = Infinity;

    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity) continue;
      if (entity.type !== 'mob') continue;

      const dist = pos.distanceTo(entity.position);
      if (dist < nearestDist && dist < 32) {
        nearest = entity;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  function fleeFrom(position) {
    const myPos = bot.entity.position;
    // Run in opposite direction
    const dx = myPos.x - position.x;
    const dz = myPos.z - position.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    const fleeTarget = myPos.offset(
      (dx / len) * 20,
      0,
      (dz / len) * 20,
    );

    const { goals, Movements } = require('mineflayer-pathfinder');
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    movements.canDig = false; // Don't stop to dig while fleeing

    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalXZ(fleeTarget.x, fleeTarget.z));
  }

  return Object.freeze({
    evaluate,
    isEating: () => isEating,
    isFleeing: () => isFleeing,
  });
}

export default createSurvivalInstinct;
