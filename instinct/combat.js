// ClawCraft - Combat Instinct
// Reactive combat logic: when to fight, what weapon, basic tactics
// No LLM needed - pattern-based decisions

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Instinct:Combat');

const ENGAGE_DISTANCE = 5;
const DISENGAGE_HEALTH = 6;
const SHIELD_BLOCK_DISTANCE = 8;

const WEAPON_PRIORITY = [
  'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe',
];

const RANGED_MOBS = new Set(['skeleton', 'stray', 'pillager', 'blaze', 'ghast']);
const EXPLOSIVE_MOBS = new Set(['creeper']);

export function createCombatInstinct(bot, bus) {
  let inCombat = false;
  let currentTarget = null;
  let combatStartTime = 0;
  let lastAttackTime = 0;

  function evaluate() {
    if (inCombat) {
      continueCombat();
    }
  }

  function engageTarget(entity) {
    if (bot.health <= DISENGAGE_HEALTH) {
      disengage('low_health');
      return;
    }

    inCombat = true;
    currentTarget = entity;
    combatStartTime = Date.now();

    equipBestWeapon();
    bus.emit('combat:engaged', {
      target: entity.name ?? entity.displayName,
      distance: bot.entity.position.distanceTo(entity.position),
    }, EventCategory.COMBAT);

    log.info(`Engaging ${entity.name ?? entity.displayName}!`);
  }

  function continueCombat() {
    if (!currentTarget || !currentTarget.isValid) {
      endCombat('target_gone');
      return;
    }

    if (bot.health <= DISENGAGE_HEALTH) {
      disengage('low_health');
      return;
    }

    const dist = bot.entity.position.distanceTo(currentTarget.position);

    // Creeper special: run away!
    if (EXPLOSIVE_MOBS.has(currentTarget.name) && dist < 4) {
      disengage('creeper_close');
      return;
    }

    // Shield against ranged mobs
    if (RANGED_MOBS.has(currentTarget.name) && dist > ENGAGE_DISTANCE) {
      equipShield();
    }

    // Attack if close enough and cooldown ready
    const now = Date.now();
    const attackCooldown = 600; // ~ms between swings
    if (dist <= ENGAGE_DISTANCE && now - lastAttackTime > attackCooldown) {
      bot.attack(currentTarget);
      lastAttackTime = now;
    }

    // Chase if too far
    if (dist > ENGAGE_DISTANCE && dist < 32) {
      const { goals } = require('mineflayer-pathfinder');
      bot.pathfinder.setGoal(new goals.GoalFollow(currentTarget, ENGAGE_DISTANCE - 1), true);
    }

    // Give up if target too far
    if (dist > 32) {
      endCombat('target_fled');
    }

    // Timeout combat after 60 seconds
    if (now - combatStartTime > 60000) {
      endCombat('timeout');
    }
  }

  function disengage(reason) {
    log.warn(`Disengaging: ${reason}`);
    inCombat = false;

    bus.emit('combat:disengaged', {
      reason,
      health: bot.health,
    }, EventCategory.COMBAT);

    // Emit flee instinct
    if (currentTarget) {
      bus.emit('instinct:flee', {
        health: bot.health,
        reason: `combat_disengage_${reason}`,
        from: currentTarget.position,
      }, EventCategory.COMBAT);
    }

    currentTarget = null;
    bot.pathfinder.setGoal(null);
  }

  function endCombat(reason) {
    const duration = Date.now() - combatStartTime;
    log.info(`Combat ended: ${reason} (${Math.round(duration / 1000)}s)`);

    bus.emit('combat:ended', {
      reason,
      durationMs: duration,
      finalHealth: bot.health,
    }, EventCategory.COMBAT);

    inCombat = false;
    currentTarget = null;
    bot.pathfinder.setGoal(null);
  }

  function equipBestWeapon() {
    const items = bot.inventory.items();
    for (const weaponName of WEAPON_PRIORITY) {
      const weapon = items.find(i => i.name === weaponName);
      if (weapon) {
        bot.equip(weapon, 'hand').catch(() => {});
        return;
      }
    }
  }

  function equipShield() {
    const shield = bot.inventory.items().find(i => i.name === 'shield');
    if (shield) {
      bot.equip(shield, 'off-hand').catch(() => {});
    }
  }

  // Auto-engage when attacked
  bus.on('health:damage', (event) => {
    if (inCombat) return;

    // Find who hit us
    const attacker = Object.values(bot.entities).find(e =>
      e.type === 'mob' &&
      e.position.distanceTo(bot.entity.position) < 8
    );

    if (attacker) {
      engageTarget(attacker);
    }
  });

  // Auto-engage hostiles that are too close
  bus.on('classified:critical', (event) => {
    if (event.data.name === 'entity:hostileNearby' && !inCombat) {
      const entity = Object.values(bot.entities).find(e => e.id === event.data.data?.id);
      if (entity && !EXPLOSIVE_MOBS.has(entity.name)) {
        engageTarget(entity);
      }
    }
  });

  return Object.freeze({
    evaluate,
    engageTarget,
    disengage: () => disengage('manual'),
    isInCombat: () => inCombat,
    getCurrentTarget: () => currentTarget,
  });
}

export default createCombatInstinct;
