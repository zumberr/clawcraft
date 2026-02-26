// ClawCraft - Inventory Management
// Equip items, manage storage, sort inventory

import { createLogger } from '../utils/logger.js';

const log = createLogger('Action:Inventory');

export function createInventoryManager(bot) {
  function listItems() {
    return bot.inventory.items().map(item => ({
      name: item.name,
      displayName: item.displayName,
      count: item.count,
      slot: item.slot,
      durability: item.durabilityUsed,
    }));
  }

  function countItem(itemName) {
    return bot.inventory.items()
      .filter(i => i.name === itemName)
      .reduce((sum, i) => sum + i.count, 0);
  }

  function hasItem(itemName, count = 1) {
    return countItem(itemName) >= count;
  }

  function findItem(itemName) {
    return bot.inventory.items().find(i => i.name === itemName) ?? null;
  }

  async function equip(itemName, destination = 'hand') {
    const item = findItem(itemName);
    if (!item) throw new Error(`No ${itemName} in inventory`);

    await bot.equip(item, destination);
    log.debug(`Equipped ${itemName} to ${destination}`);
  }

  async function toss(itemName, count = null) {
    const item = findItem(itemName);
    if (!item) throw new Error(`No ${itemName} in inventory`);

    const amount = count ?? item.count;
    await bot.toss(item.type, null, amount);
    log.info(`Tossed ${amount}x ${itemName}`);
  }

  async function storeInChest(itemName, chestPosition = null) {
    const mcData = require('minecraft-data')(bot.version);

    // Find chest
    let chestBlock;
    if (chestPosition) {
      chestBlock = bot.blockAt(chestPosition);
    } else {
      const chests = bot.findBlocks({
        matching: mcData.blocksByName.chest.id,
        maxDistance: 32,
        count: 1,
      });
      if (chests.length === 0) throw new Error('No chest found nearby');
      chestBlock = bot.blockAt(chests[0]);
    }

    if (!chestBlock) throw new Error('Chest block not found');

    // Move to chest
    if (bot.entity.position.distanceTo(chestBlock.position) > 4) {
      const { goals, Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(bot, mcData);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(
        chestBlock.position.x, chestBlock.position.y, chestBlock.position.z,
      ));
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10000);
        bot.once('goal_reached', () => { clearTimeout(timer); resolve(); });
      });
    }

    const chest = await bot.openContainer(chestBlock);
    const item = findItem(itemName);

    if (item) {
      await chest.deposit(item.type, null, item.count);
      log.info(`Stored ${item.count}x ${itemName} in chest`);
    }

    chest.close();
  }

  async function takeFromChest(itemName, count = null, chestPosition = null) {
    const mcData = require('minecraft-data')(bot.version);

    let chestBlock;
    if (chestPosition) {
      chestBlock = bot.blockAt(chestPosition);
    } else {
      const chests = bot.findBlocks({
        matching: mcData.blocksByName.chest.id,
        maxDistance: 32,
        count: 1,
      });
      if (chests.length === 0) throw new Error('No chest found nearby');
      chestBlock = bot.blockAt(chests[0]);
    }

    const chest = await bot.openContainer(chestBlock);
    const chestItems = chest.items();
    const target = chestItems.find(i => i.name === itemName);

    if (!target) {
      chest.close();
      throw new Error(`No ${itemName} found in chest`);
    }

    const amount = count ?? target.count;
    await chest.withdraw(target.type, null, amount);
    log.info(`Took ${amount}x ${itemName} from chest`);

    chest.close();
  }

  function getEmptySlots() {
    return bot.inventory.emptySlotCount();
  }

  function isInventoryFull() {
    return getEmptySlots() === 0;
  }

  function getArmor() {
    return {
      head: bot.inventory.slots[5]?.name ?? null,
      chest: bot.inventory.slots[6]?.name ?? null,
      legs: bot.inventory.slots[7]?.name ?? null,
      feet: bot.inventory.slots[8]?.name ?? null,
    };
  }

  function getSummary() {
    const items = listItems();
    const grouped = {};
    for (const item of items) {
      grouped[item.name] = (grouped[item.name] || 0) + item.count;
    }
    return Object.freeze({
      totalSlots: 36,
      usedSlots: items.length,
      emptySlots: getEmptySlots(),
      items: grouped,
      armor: getArmor(),
    });
  }

  return Object.freeze({
    listItems,
    countItem,
    hasItem,
    findItem,
    equip,
    toss,
    storeInChest,
    takeFromChest,
    getEmptySlots,
    isInventoryFull,
    getArmor,
    getSummary,
  });
}

export default createInventoryManager;
