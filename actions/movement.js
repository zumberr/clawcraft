// ClawCraft - Movement Actions
// Walk, run, jump, swim, pathfind to locations

import { createLogger } from '../utils/logger.js';
import { formatPos } from '../utils/helpers.js';

const log = createLogger('Action:Movement');

export function createMovement(bot) {
  function getPathfinder() {
    const { goals, Movements } = require('mineflayer-pathfinder');
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    return { goals, movements };
  }

  async function goTo(position) {
    const { goals, movements } = getPathfinder();
    bot.pathfinder.setMovements(movements);

    log.info(`Moving to ${formatPos(position)}`);
    bot.pathfinder.setGoal(new goals.GoalBlock(
      Math.floor(position.x),
      Math.floor(position.y),
      Math.floor(position.z),
    ));

    return waitForGoal();
  }

  async function goToBlock(blockName, maxDistance = 64) {
    const mcData = require('minecraft-data')(bot.version);
    const blockType = mcData.blocksByName[blockName];
    if (!blockType) throw new Error(`Unknown block: ${blockName}`);

    const blocks = bot.findBlocks({
      matching: blockType.id,
      maxDistance,
      count: 1,
    });

    if (blocks.length === 0) {
      throw new Error(`No ${blockName} found within ${maxDistance} blocks`);
    }

    const target = blocks[0];
    log.info(`Found ${blockName} at ${formatPos(target)}`);

    const { goals, movements } = getPathfinder();
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalGetToBlock(target.x, target.y, target.z));

    return waitForGoal();
  }

  async function goToEntity(entity) {
    const { goals, movements } = getPathfinder();
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
    log.info(`Following entity: ${entity.username ?? entity.name}`);
  }

  async function followPlayer(username) {
    const player = bot.players[username]?.entity;
    if (!player) throw new Error(`Player ${username} not found nearby`);

    return goToEntity(player);
  }

  function stopMoving() {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    log.info('Movement stopped');
  }

  async function lookAt(position) {
    await bot.lookAt(position);
  }

  async function jump() {
    bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 500));
    bot.setControlState('jump', false);
  }

  async function collectDrops(radius = 16) {
    const items = Object.values(bot.entities).filter(e =>
      e.type === 'object' &&
      e.position.distanceTo(bot.entity.position) < radius
    );

    for (const item of items) {
      try {
        const { goals, movements } = getPathfinder();
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new goals.GoalBlock(
          Math.floor(item.position.x),
          Math.floor(item.position.y),
          Math.floor(item.position.z),
        ));
        await waitForGoal(5000);
      } catch {
        // Item might have despawned
      }
    }

    log.info(`Collected drops (${items.length} found)`);
  }

  function waitForGoal(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        bot.pathfinder.setGoal(null);
        reject(new Error('Movement timeout'));
      }, timeout);

      bot.once('goal_reached', () => {
        clearTimeout(timer);
        resolve();
      });

      bot.once('path_update', (r) => {
        if (r.status === 'noPath') {
          clearTimeout(timer);
          reject(new Error('No path found'));
        }
      });
    });
  }

  return Object.freeze({
    goTo,
    goToBlock,
    goToEntity,
    followPlayer,
    stopMoving,
    lookAt,
    jump,
    collectDrops,
  });
}

export default createMovement;
