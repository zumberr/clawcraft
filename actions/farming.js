// ClawCraft - Farming Actions
// Plant, harvest, breed animals

import { createLogger } from '../utils/logger.js';
import { formatPos } from '../utils/helpers.js';

const log = createLogger('Action:Farming');

const CROP_SEEDS = {
  wheat: 'wheat_seeds',
  carrots: 'carrot',
  potatoes: 'potato',
  beetroots: 'beetroot_seeds',
  melon_stem: 'melon_seeds',
  pumpkin_stem: 'pumpkin_seeds',
};

const MATURE_AGE = {
  wheat: 7,
  carrots: 7,
  potatoes: 7,
  beetroots: 3,
};

export function createFarming(bot) {
  async function harvest(cropName = null, radius = 16) {
    const mcData = require('minecraft-data')(bot.version);
    const cropNames = cropName ? [cropName] : Object.keys(MATURE_AGE);
    let harvested = 0;

    for (const name of cropNames) {
      const blockType = mcData.blocksByName[name];
      if (!blockType) continue;

      const blocks = bot.findBlocks({
        matching: blockType.id,
        maxDistance: radius,
        count: 50,
      });

      for (const pos of blocks) {
        const block = bot.blockAt(pos);
        if (!block) continue;

        // Check if crop is mature
        const matureAge = MATURE_AGE[name] ?? 7;
        const metadata = block.metadata;
        if (metadata < matureAge) continue;

        // Move close
        if (bot.entity.position.distanceTo(pos) > 4) {
          try {
            const { goals, Movements } = require('mineflayer-pathfinder');
            const movements = new Movements(bot, mcData);
            bot.pathfinder.setMovements(movements);
            bot.pathfinder.setGoal(new goals.GoalGetToBlock(pos.x, pos.y, pos.z));
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, 10000);
              bot.once('goal_reached', () => { clearTimeout(timer); resolve(); });
            });
          } catch { continue; }
        }

        try {
          await bot.dig(block);
          harvested++;
        } catch { /* skip */ }
      }
    }

    log.info(`Harvested ${harvested} crops`);
    return harvested;
  }

  async function plant(cropName = 'wheat', radius = 16) {
    const mcData = require('minecraft-data')(bot.version);
    const seedName = CROP_SEEDS[cropName];
    if (!seedName) throw new Error(`Unknown crop: ${cropName}`);

    const seeds = bot.inventory.items().find(i => i.name === seedName);
    if (!seeds) throw new Error(`No ${seedName} in inventory`);

    // Find farmland blocks
    const farmlandType = mcData.blocksByName.farmland;
    if (!farmlandType) return 0;

    const farmlandBlocks = bot.findBlocks({
      matching: farmlandType.id,
      maxDistance: radius,
      count: 50,
    });

    let planted = 0;

    for (const pos of farmlandBlocks) {
      // Check if something is already planted above
      const above = bot.blockAt(pos.offset(0, 1, 0));
      if (above && above.name !== 'air') continue;

      // Move close
      if (bot.entity.position.distanceTo(pos) > 4) {
        try {
          const { goals, Movements } = require('mineflayer-pathfinder');
          const movements = new Movements(bot, mcData);
          bot.pathfinder.setMovements(movements);
          bot.pathfinder.setGoal(new goals.GoalGetToBlock(pos.x, pos.y, pos.z));
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 10000);
            bot.once('goal_reached', () => { clearTimeout(timer); resolve(); });
          });
        } catch { continue; }
      }

      try {
        await bot.equip(seeds, 'hand');
        const farmBlock = bot.blockAt(pos);
        await bot.placeBlock(farmBlock, { x: 0, y: 1, z: 0 });
        planted++;

        // Check if we ran out of seeds
        const remaining = bot.inventory.items().find(i => i.name === seedName);
        if (!remaining) break;
      } catch { /* skip */ }
    }

    log.info(`Planted ${planted} ${cropName}`);
    return planted;
  }

  async function harvestAndReplant(cropName = 'wheat', radius = 16) {
    const harvested = await harvest(cropName, radius);
    // Short pause to let drops settle
    await new Promise(resolve => setTimeout(resolve, 1000));
    const planted = await plant(cropName, radius);
    log.info(`Harvest & replant: ${harvested} harvested, ${planted} planted`);
    return { harvested, planted };
  }

  async function breedAnimals(animalType, radius = 16) {
    const breedItems = {
      cow: 'wheat', sheep: 'wheat', chicken: 'wheat_seeds',
      pig: 'carrot', rabbit: 'carrot', horse: 'golden_apple',
    };

    const foodName = breedItems[animalType];
    if (!foodName) throw new Error(`Don't know how to breed ${animalType}`);

    const food = bot.inventory.items().find(i => i.name === foodName);
    if (!food) throw new Error(`No ${foodName} to breed ${animalType}`);

    const animals = Object.values(bot.entities).filter(e =>
      e.name === animalType &&
      e.position.distanceTo(bot.entity.position) < radius
    );

    if (animals.length < 2) {
      throw new Error(`Need at least 2 ${animalType} nearby (found ${animals.length})`);
    }

    await bot.equip(food, 'hand');

    let bred = 0;
    for (const animal of animals.slice(0, 2)) {
      try {
        await bot.useOn(animal);
        bred++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch { /* skip */ }
    }

    log.info(`Bred ${bred} ${animalType}`);
    return bred;
  }

  return Object.freeze({
    harvest,
    plant,
    harvestAndReplant,
    breedAnimals,
  });
}

export default createFarming;
