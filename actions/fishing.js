// ClawCraft - Fishing Action
// Autonomous fishing near water bodies
// Detects water, equips rod, casts, waits for bite, reels in

import { createLogger } from '../utils/logger.js';

const log = createLogger('Actions:Fishing');

const CAST_WAIT_TIMEOUT = 30000; // Max 30s wait per cast
const FISH_FOOD_ITEMS = new Set([
  'cod', 'salmon', 'tropical_fish', 'pufferfish',
]);

export function createFishing(bot) {

  let isFishing = false;
  let castCount = 0;
  let catchCount = 0;

  /**
   * Fish at current location (must be near water)
   * Returns caught items array
   */
  async function fish(options = {}) {
    const { maxCasts = 10, timeout = 300000 } = options;
    const startTime = Date.now();
    const caught = [];

    // Check for fishing rod
    const rod = bot.inventory.items().find(i => i.name === 'fishing_rod');
    if (!rod) {
      throw new Error('No fishing rod in inventory');
    }

    // Equip rod
    await bot.equip(rod, 'hand');

    // Find nearest water
    const waterBlock = bot.findBlock({
      matching: (block) => block.name === 'water',
      maxDistance: 8,
    });

    if (!waterBlock) {
      throw new Error('No water nearby');
    }

    // Look at water
    await bot.lookAt(waterBlock.position.offset(0.5, 0.5, 0.5));

    isFishing = true;
    log.info('Starting fishing session');

    try {
      for (let i = 0; i < maxCasts && Date.now() - startTime < timeout; i++) {
        const item = await castAndReel();
        if (item) {
          caught.push(item);
          catchCount++;
          log.debug(`Caught: ${item.name} (${caught.length} total this session)`);
        }
        castCount++;

        // Brief pause between casts
        await new Promise(r => setTimeout(r, 1000));
      }
    } finally {
      isFishing = false;
    }

    log.info(`Fishing session done: ${caught.length} items caught in ${castCount} casts`);
    return caught;
  }

  async function castAndReel() {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, CAST_WAIT_TIMEOUT);

      // Activate fishing rod (cast)
      bot.activateItem();

      // Listen for playerCollect event (fish caught)
      const onCollect = (collector, collected) => {
        if (collector === bot.entity && !resolved) {
          resolved = true;
          clearTimeout(timer);
          bot.removeListener('playerCollect', onCollect);

          const item = collected.getDroppedItem?.();
          resolve(item ? { name: item.name, count: item.count } : null);
        }
      };

      bot.on('playerCollect', onCollect);

      // Also deactivate after a random wait to reel in
      setTimeout(() => {
        if (!resolved) {
          bot.deactivateItem();
        }
      }, 3000 + Math.random() * 5000);
    });
  }

  /**
   * Find nearest water and go fish there
   */
  async function findAndFish(options = {}) {
    const waterBlock = bot.findBlock({
      matching: (block) => block.name === 'water',
      maxDistance: 32,
    });

    if (!waterBlock) {
      throw new Error('No water found within 32 blocks');
    }

    // Move near the water (but not in it)
    const pos = waterBlock.position;
    const landPositions = [
      pos.offset(2, 1, 0),
      pos.offset(-2, 1, 0),
      pos.offset(0, 1, 2),
      pos.offset(0, 1, -2),
    ];

    // Try to pathfind to a position next to water
    let moved = false;
    for (const target of landPositions) {
      try {
        const goals = new (require('mineflayer-pathfinder').goals.GoalNear)(target.x, target.y, target.z, 1);
        await bot.pathfinder.goto(goals);
        moved = true;
        break;
      } catch {
        continue;
      }
    }

    if (!moved) {
      throw new Error('Cannot reach water');
    }

    return fish(options);
  }

  function getIsFishing() {
    return isFishing;
  }

  function getStats() {
    return Object.freeze({
      isFishing,
      totalCasts: castCount,
      totalCatches: catchCount,
      successRate: castCount > 0 ? (catchCount / castCount * 100).toFixed(1) + '%' : 'N/A',
    });
  }

  return Object.freeze({
    fish,
    findAndFish,
    getIsFishing,
    getStats,
  });
}

export default createFishing;
