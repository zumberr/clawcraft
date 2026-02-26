// ClawCraft - Smelting Action
// Dedicated smelting operations using furnaces, blast furnaces, smokers
// Separated from crafting.js for cleaner module organization

import { createLogger } from '../utils/logger.js';

const log = createLogger('Actions:Smelting');

// Fuel values (burn time in ticks, 200 ticks = 1 item smelted)
const FUEL_VALUES = Object.freeze({
  'coal': 8,
  'charcoal': 8,
  'coal_block': 80,
  'lava_bucket': 100,
  'blaze_rod': 12,
  'oak_planks': 1.5,
  'spruce_planks': 1.5,
  'birch_planks': 1.5,
  'stick': 0.5,
  'oak_log': 1.5,
  'spruce_log': 1.5,
  'birch_log': 1.5,
});

// Common smelting recipes: input -> output
const SMELTING_RECIPES = Object.freeze({
  'raw_iron': 'iron_ingot',
  'raw_gold': 'gold_ingot',
  'raw_copper': 'copper_ingot',
  'iron_ore': 'iron_ingot',
  'gold_ore': 'gold_ingot',
  'copper_ore': 'copper_ingot',
  'cobblestone': 'stone',
  'sand': 'glass',
  'clay_ball': 'brick',
  'oak_log': 'charcoal',
  'spruce_log': 'charcoal',
  'birch_log': 'charcoal',
  'raw_cod': 'cooked_cod',
  'raw_salmon': 'cooked_salmon',
  'raw_beef': 'cooked_beef',
  'raw_porkchop': 'cooked_porkchop',
  'raw_chicken': 'cooked_chicken',
  'raw_mutton': 'cooked_mutton',
  'raw_rabbit': 'cooked_rabbit',
  'potato': 'baked_potato',
  'kelp': 'dried_kelp',
  'cactus': 'green_dye',
  'ancient_debris': 'netherite_scrap',
});

const FURNACE_TYPES = new Set(['furnace', 'blast_furnace', 'smoker']);

export function createSmelting(bot) {

  /**
   * Smelt items in the nearest furnace
   * @param {string} inputItem - item name to smelt
   * @param {number} count - how many to smelt
   * @param {string} fuelItem - fuel to use (auto-selects if null)
   */
  async function smelt(inputItem, count = 1, fuelItem = null) {
    const output = SMELTING_RECIPES[inputItem];
    if (!output) {
      throw new Error(`No smelting recipe for ${inputItem}`);
    }

    // Check inventory for input
    const inputSlot = bot.inventory.items().find(i => i.name === inputItem);
    if (!inputSlot || inputSlot.count < count) {
      throw new Error(`Not enough ${inputItem} (have ${inputSlot?.count ?? 0}, need ${count})`);
    }

    // Find or select fuel
    const fuel = fuelItem ? findFuelByName(fuelItem) : findBestFuel();
    if (!fuel) {
      throw new Error('No fuel available');
    }

    const fuelNeeded = Math.ceil(count / (FUEL_VALUES[fuel.name] ?? 1));
    if (fuel.count < fuelNeeded) {
      log.warn(`Limited fuel: can smelt ${Math.floor(fuel.count * (FUEL_VALUES[fuel.name] ?? 1))} of ${count}`);
    }

    // Find furnace
    const furnace = findNearestFurnace();
    if (!furnace) {
      throw new Error('No furnace nearby');
    }

    log.info(`Smelting ${count}x ${inputItem} -> ${output} (fuel: ${fuel.name})`);

    // Open furnace
    const furnaceBlock = await bot.openFurnace(furnace);

    try {
      // Put fuel
      await furnaceBlock.putFuel(fuel.type, null, Math.min(fuel.count, fuelNeeded));

      // Put input
      await furnaceBlock.putInput(inputSlot.type, null, Math.min(inputSlot.count, count));

      // Wait for smelting (10s per item baseline)
      const waitTime = count * 10000;
      log.debug(`Waiting ${waitTime / 1000}s for smelting...`);
      await new Promise(r => setTimeout(r, Math.min(waitTime, 120000)));

      // Take output
      const outputSlot = furnaceBlock.outputItem();
      if (outputSlot) {
        await furnaceBlock.takeOutput();
        log.info(`Smelted: ${outputSlot.count}x ${outputSlot.name}`);
        return { item: outputSlot.name, count: outputSlot.count };
      }

      return { item: output, count: 0 };
    } finally {
      furnaceBlock.close();
    }
  }

  /**
   * Smelt all raw ores in inventory
   */
  async function smeltAllOres() {
    const ores = bot.inventory.items().filter(i =>
      i.name.startsWith('raw_') || ['iron_ore', 'gold_ore', 'copper_ore'].includes(i.name)
    );

    if (ores.length === 0) {
      log.debug('No ores to smelt');
      return [];
    }

    const results = [];
    for (const ore of ores) {
      try {
        const result = await smelt(ore.name, ore.count);
        results.push(result);
      } catch (err) {
        log.warn(`Failed to smelt ${ore.name}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Cook all raw food in inventory
   */
  async function cookAllFood() {
    const rawFoods = bot.inventory.items().filter(i =>
      i.name.startsWith('raw_') && SMELTING_RECIPES[i.name]?.includes('cooked')
    );

    if (rawFoods.length === 0) return [];

    const results = [];
    for (const food of rawFoods) {
      try {
        const result = await smelt(food.name, food.count);
        results.push(result);
      } catch (err) {
        log.warn(`Failed to cook ${food.name}: ${err.message}`);
      }
    }

    return results;
  }

  function findNearestFurnace(maxDistance = 32) {
    return bot.findBlock({
      matching: (block) => FURNACE_TYPES.has(block.name),
      maxDistance,
    });
  }

  function findBestFuel() {
    // Prioritize: coal > charcoal > planks > sticks
    const priority = ['coal', 'charcoal', 'coal_block', 'lava_bucket', 'blaze_rod'];
    for (const fuelName of priority) {
      const item = bot.inventory.items().find(i => i.name === fuelName);
      if (item) return item;
    }

    // Try any burnable
    for (const fuelName of Object.keys(FUEL_VALUES)) {
      const item = bot.inventory.items().find(i => i.name === fuelName);
      if (item) return item;
    }

    return null;
  }

  function findFuelByName(name) {
    return bot.inventory.items().find(i => i.name === name) ?? null;
  }

  function canSmelt(itemName) {
    return itemName in SMELTING_RECIPES;
  }

  function getRecipeOutput(itemName) {
    return SMELTING_RECIPES[itemName] ?? null;
  }

  function hasFuel() {
    return findBestFuel() !== null;
  }

  function hasFurnace(maxDistance = 32) {
    return findNearestFurnace(maxDistance) !== null;
  }

  return Object.freeze({
    smelt,
    smeltAllOres,
    cookAllFood,
    canSmelt,
    getRecipeOutput,
    hasFuel,
    hasFurnace,
    SMELTING_RECIPES,
  });
}

export default createSmelting;
