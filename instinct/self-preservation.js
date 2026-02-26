// ClawCraft - Self Preservation
// Clutch plays: water bucket, avoid falls, swim to surface, avoid lava

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Instinct:SelfPreservation');

const FALL_THRESHOLD = 4;
const VOID_Y = -64;
const SUFFOCATION_BLOCKS = new Set(['sand', 'gravel', 'concrete_powder']);

export function createSelfPreservation(bot, bus) {
  let lastY = null;
  let fallingTicks = 0;
  let isSwimming = false;

  function evaluate() {
    checkFalling();
    checkDrowning();
    checkFire();
    checkVoid();
    checkSuffocation();
  }

  function checkFalling() {
    const pos = bot.entity.position;
    const vel = bot.entity.velocity;
    const onGround = bot.entity.onGround;

    // Detect sustained downward velocity
    if (vel.y < -0.5 && !onGround) {
      fallingTicks++;

      if (fallingTicks > 10) { // Falling for ~0.5 seconds
        attemptWaterBucket();
      }
    } else {
      fallingTicks = 0;
    }

    // Check for ledge ahead
    if (onGround && bot.entity.velocity.x !== 0 || bot.entity.velocity.z !== 0) {
      const lookDir = bot.entity.yaw;
      const dx = -Math.sin(lookDir) * 2;
      const dz = Math.cos(lookDir) * 2;
      const ahead = pos.offset(dx, -1, dz);
      const blockBelow = bot.blockAt(ahead);

      if (blockBelow && blockBelow.name === 'air') {
        // Check depth
        let depth = 0;
        for (let y = -1; y > -20; y--) {
          const check = bot.blockAt(ahead.offset(0, y, 0));
          if (check && check.name !== 'air') break;
          depth++;
        }

        if (depth > FALL_THRESHOLD) {
          bus.emit('instinct:ledgeWarning', { depth, position: ahead }, EventCategory.AGENT);
        }
      }
    }

    lastY = pos.y;
  }

  function attemptWaterBucket() {
    const waterBucket = bot.inventory.items().find(i => i.name === 'water_bucket');
    if (!waterBucket) return;

    log.info('MLG water bucket attempt!');

    bot.equip(waterBucket, 'hand')
      .then(() => {
        // Look straight down
        bot.look(bot.entity.yaw, Math.PI / 2, true);
        // Place water
        const below = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        if (below) {
          bot.placeBlock(below, { x: 0, y: 1, z: 0 });
          // Pick it up again after landing
          setTimeout(() => {
            const waterBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
            if (waterBlock && waterBlock.name === 'water') {
              const bucket = bot.inventory.items().find(i => i.name === 'bucket');
              if (bucket) {
                bot.equip(bucket, 'hand').then(() => {
                  bot.activateItem();
                }).catch(() => {});
              }
            }
          }, 1000);
        }
      })
      .catch((err) => {
        log.error(`Water bucket failed: ${err.message}`);
      });

    bus.emit('instinct:clutchAttempt', { type: 'water_bucket' }, EventCategory.AGENT);
  }

  function checkDrowning() {
    const pos = bot.entity.position;
    const headBlock = bot.blockAt(pos.offset(0, 1.6, 0));
    const isUnderwater = headBlock && headBlock.name === 'water';

    if (isUnderwater && !isSwimming) {
      isSwimming = true;
      log.info('Underwater! Swimming up.');

      // Swim up
      bot.setControlState('jump', true);
      bus.emit('instinct:drowning', { position: pos }, EventCategory.HEALTH);

      setTimeout(() => {
        const stillUnderwater = bot.blockAt(bot.entity.position.offset(0, 1.6, 0))?.name === 'water';
        if (!stillUnderwater) {
          bot.setControlState('jump', false);
          isSwimming = false;
        }
      }, 2000);
    } else if (!isUnderwater && isSwimming) {
      bot.setControlState('jump', false);
      isSwimming = false;
    }
  }

  function checkFire() {
    const pos = bot.entity.position;
    const blockAtFeet = bot.blockAt(pos);
    const isOnFire = bot.entity.metadata?.[0] & 0x01; // Entity on fire flag

    if (blockAtFeet && (blockAtFeet.name === 'lava' || blockAtFeet.name === 'fire')) {
      log.warn('Standing in fire/lava! Moving away!');

      // Jump and move to nearest safe block
      bot.setControlState('jump', true);
      bot.setControlState('sprint', true);
      bot.setControlState('forward', true);

      setTimeout(() => {
        bot.setControlState('jump', false);
        bot.setControlState('sprint', false);
        bot.setControlState('forward', false);
      }, 2000);

      bus.emit('instinct:fire', { block: blockAtFeet.name }, EventCategory.HEALTH);
    }
  }

  function checkVoid() {
    if (bot.entity.position.y < VOID_Y) {
      log.error('Falling into the void!');
      bus.emit('instinct:void', { y: bot.entity.position.y }, EventCategory.HEALTH);
      // Not much we can do here, but emit the event for memory
    }
  }

  function checkSuffocation() {
    const headBlock = bot.blockAt(bot.entity.position.offset(0, 1, 0));
    if (headBlock && SUFFOCATION_BLOCKS.has(headBlock.name)) {
      log.warn(`Suffocating in ${headBlock.name}! Digging out!`);

      bot.dig(headBlock).catch(() => {});
      bus.emit('instinct:suffocation', { block: headBlock.name }, EventCategory.HEALTH);
    }
  }

  return Object.freeze({
    evaluate,
  });
}

export default createSelfPreservation;
