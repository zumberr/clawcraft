// ClawCraft - Interaction Actions
// Interact with blocks, villagers, doors, buttons, levers

import { createLogger } from '../utils/logger.js';
import { formatPos } from '../utils/helpers.js';

const log = createLogger('Action:Interaction');

const INTERACTABLE_BLOCKS = new Set([
  'crafting_table', 'furnace', 'blast_furnace', 'smoker',
  'enchanting_table', 'anvil', 'grindstone', 'stonecutter',
  'loom', 'cartography_table', 'smithing_table', 'brewing_stand',
  'chest', 'trapped_chest', 'ender_chest', 'barrel', 'shulker_box',
  'oak_door', 'spruce_door', 'birch_door', 'jungle_door',
  'acacia_door', 'dark_oak_door', 'iron_door', 'warped_door', 'crimson_door',
  'oak_trapdoor', 'spruce_trapdoor', 'birch_trapdoor',
  'lever', 'stone_button', 'oak_button',
  'oak_fence_gate', 'spruce_fence_gate', 'birch_fence_gate',
  'bed', 'white_bed', 'red_bed',
  'note_block', 'jukebox', 'bell',
]);

export function createInteraction(bot) {
  async function interact(target, action = 'use') {
    if (typeof target === 'string') {
      // Target is a block name - find nearest
      return interactWithBlockType(target);
    }

    if (target.position) {
      // Target is a position/block
      return interactWithBlockAt(target);
    }

    if (target.type === 'player' || target.type === 'mob') {
      return interactWithEntity(target);
    }

    throw new Error(`Don't know how to interact with: ${target}`);
  }

  async function interactWithBlockType(blockName) {
    const mcData = require('minecraft-data')(bot.version);
    const blockType = mcData.blocksByName[blockName];
    if (!blockType) throw new Error(`Unknown block: ${blockName}`);

    const blocks = bot.findBlocks({
      matching: blockType.id,
      maxDistance: 32,
      count: 1,
    });

    if (blocks.length === 0) {
      throw new Error(`No ${blockName} found nearby`);
    }

    const block = bot.blockAt(blocks[0]);
    return interactWithBlockAt(block);
  }

  async function interactWithBlockAt(block) {
    if (!block) throw new Error('Block not found');

    // Move close enough
    if (bot.entity.position.distanceTo(block.position) > 4) {
      const mcData = require('minecraft-data')(bot.version);
      const { goals, Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(bot, mcData);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(
        block.position.x, block.position.y, block.position.z,
      ));

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10000);
        bot.once('goal_reached', () => { clearTimeout(timer); resolve(); });
      });
    }

    await bot.activateBlock(block);
    log.info(`Interacted with ${block.name} at ${formatPos(block.position)}`);
  }

  async function interactWithEntity(entity) {
    if (!entity || !entity.isValid) throw new Error('Entity not found or invalid');

    // Move close enough
    if (bot.entity.position.distanceTo(entity.position) > 3) {
      const mcData = require('minecraft-data')(bot.version);
      const { goals, Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(bot, mcData);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    await bot.useOn(entity);
    log.info(`Interacted with ${entity.name ?? entity.username}`);
  }

  async function openDoor(position = null) {
    const mcData = require('minecraft-data')(bot.version);
    const doorTypes = Object.keys(mcData.blocksByName).filter(n => n.includes('door') && !n.includes('trapdoor'));

    let door;
    if (position) {
      door = bot.blockAt(position);
    } else {
      for (const doorType of doorTypes) {
        const blockType = mcData.blocksByName[doorType];
        const found = bot.findBlocks({ matching: blockType.id, maxDistance: 8, count: 1 });
        if (found.length > 0) {
          door = bot.blockAt(found[0]);
          break;
        }
      }
    }

    if (!door) throw new Error('No door found nearby');

    await bot.activateBlock(door);
    log.debug(`Toggled door at ${formatPos(door.position)}`);
  }

  async function sleep() {
    const mcData = require('minecraft-data')(bot.version);
    const bedTypes = Object.keys(mcData.blocksByName).filter(n => n.includes('bed'));

    let bed;
    for (const bedType of bedTypes) {
      const blockType = mcData.blocksByName[bedType];
      const found = bot.findBlocks({ matching: blockType.id, maxDistance: 16, count: 1 });
      if (found.length > 0) {
        bed = bot.blockAt(found[0]);
        break;
      }
    }

    if (!bed) throw new Error('No bed found nearby');

    try {
      await bot.sleep(bed);
      log.info('Going to sleep...');

      await new Promise((resolve) => {
        bot.once('wake', resolve);
        setTimeout(resolve, 30000); // Max sleep time
      });

      log.info('Woke up!');
    } catch (err) {
      if (err.message.includes('monsters')) {
        throw new Error('Can\'t sleep - monsters nearby!');
      }
      if (err.message.includes('day')) {
        log.debug('Not tired enough to sleep');
      } else {
        throw err;
      }
    }
  }

  async function useItem() {
    bot.activateItem();
    log.debug('Used held item');
  }

  function isInteractable(blockName) {
    return INTERACTABLE_BLOCKS.has(blockName);
  }

  return Object.freeze({
    interact,
    interactWithBlockType,
    interactWithBlockAt,
    interactWithEntity,
    openDoor,
    sleep,
    useItem,
    isInteractable,
  });
}

export default createInteraction;
