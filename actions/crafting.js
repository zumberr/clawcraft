// ClawCraft - Crafting Actions
// Craft items using crafting table or inventory

import { createLogger } from '../utils/logger.js';

const log = createLogger('Action:Crafting');

export function createCrafting(bot) {
  async function craft(itemName, count = 1) {
    const mcData = require('minecraft-data')(bot.version);
    const item = mcData.itemsByName[itemName];
    if (!item) throw new Error(`Unknown item: ${itemName}`);

    const recipes = bot.recipesFor(item.id, null, null, null);
    if (recipes.length === 0) {
      // Try with crafting table
      return craftWithTable(itemName, count);
    }

    // Craft without table
    const recipe = recipes[0];
    const craftCount = Math.min(count, 64);

    try {
      await bot.craft(recipe, craftCount, null);
      log.info(`Crafted ${craftCount}x ${itemName} (no table)`);
      return craftCount;
    } catch (err) {
      // Fallback to crafting table
      return craftWithTable(itemName, count);
    }
  }

  async function craftWithTable(itemName, count = 1) {
    const mcData = require('minecraft-data')(bot.version);
    const item = mcData.itemsByName[itemName];
    if (!item) throw new Error(`Unknown item: ${itemName}`);

    // Find nearby crafting table
    const tableBlock = bot.findBlocks({
      matching: mcData.blocksByName.crafting_table.id,
      maxDistance: 32,
      count: 1,
    });

    if (tableBlock.length === 0) {
      throw new Error('No crafting table found nearby. Need to craft or place one.');
    }

    const table = bot.blockAt(tableBlock[0]);

    // Move to table if needed
    if (bot.entity.position.distanceTo(table.position) > 4) {
      const { goals, Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(bot, mcData);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(
        table.position.x, table.position.y, table.position.z,
      ));

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Move to table timeout')), 15000);
        bot.once('goal_reached', () => { clearTimeout(timer); resolve(); });
      });
    }

    const recipes = bot.recipesFor(item.id, null, null, table);
    if (recipes.length === 0) {
      throw new Error(`No recipe found for ${itemName} (missing materials?)`);
    }

    const recipe = recipes[0];
    const craftCount = Math.min(count, 64);

    await bot.craft(recipe, craftCount, table);
    log.info(`Crafted ${craftCount}x ${itemName} (with table)`);
    return craftCount;
  }

  async function smelt(itemName, fuelName = 'coal', count = 1) {
    const mcData = require('minecraft-data')(bot.version);

    // Find furnace
    const furnaceBlock = bot.findBlocks({
      matching: mcData.blocksByName.furnace.id,
      maxDistance: 32,
      count: 1,
    });

    if (furnaceBlock.length === 0) {
      throw new Error('No furnace found nearby');
    }

    const furnace = await bot.openFurnace(bot.blockAt(furnaceBlock[0]));

    // Put fuel
    const fuel = bot.inventory.items().find(i => i.name === fuelName);
    if (fuel) {
      await furnace.putFuel(fuel.type, null, Math.min(fuel.count, count));
    }

    // Put input
    const input = bot.inventory.items().find(i => i.name === itemName);
    if (!input) {
      furnace.close();
      throw new Error(`No ${itemName} in inventory to smelt`);
    }

    await furnace.putInput(input.type, null, Math.min(input.count, count));

    log.info(`Smelting ${count}x ${itemName} with ${fuelName}`);

    // Wait for smelting (rough estimate)
    await new Promise(resolve => setTimeout(resolve, count * 10000));

    // Collect output
    const output = furnace.outputItem();
    if (output) {
      await furnace.takeOutput();
    }

    furnace.close();
    return count;
  }

  function canCraft(itemName) {
    const mcData = require('minecraft-data')(bot.version);
    const item = mcData.itemsByName[itemName];
    if (!item) return false;

    const recipes = bot.recipesFor(item.id);
    return recipes.length > 0;
  }

  function getAvailableRecipes() {
    const mcData = require('minecraft-data')(bot.version);
    const available = [];

    for (const item of Object.values(mcData.itemsByName)) {
      const recipes = bot.recipesFor(item.id);
      if (recipes.length > 0) {
        available.push(item.name);
      }
    }

    return available;
  }

  return Object.freeze({
    craft,
    craftWithTable,
    smelt,
    canCraft,
    getAvailableRecipes,
  });
}

export default createCrafting;
