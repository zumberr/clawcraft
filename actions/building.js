// ClawCraft - Building Actions
// Place blocks, build simple structures

import { createLogger } from '../utils/logger.js';
import { formatPos } from '../utils/helpers.js';

const log = createLogger('Action:Building');

export function createBuilding(bot) {
  async function placeBlock(itemName, position, faceVector = { x: 0, y: 1, z: 0 }) {
    const item = bot.inventory.items().find(i => i.name === itemName);
    if (!item) throw new Error(`No ${itemName} in inventory`);

    await bot.equip(item, 'hand');

    // Find reference block (block adjacent to where we want to place)
    const refBlock = bot.blockAt(position.offset(-faceVector.x, -faceVector.y, -faceVector.z));
    if (!refBlock) throw new Error(`No reference block at target location`);

    await bot.placeBlock(refBlock, faceVector);
    log.debug(`Placed ${itemName} at ${formatPos(position)}`);
  }

  async function buildStructure(type, params = {}) {
    switch (type) {
      case 'box':
      case 'shelter':
        return buildBox(params);
      case 'wall':
        return buildWall(params);
      case 'tower':
        return buildTower(params);
      case 'floor':
        return buildFloor(params);
      default:
        throw new Error(`Unknown structure type: ${type}`);
    }
  }

  async function buildBox(params) {
    const {
      size = { x: 5, y: 3, z: 5 },
      material = 'cobblestone',
      origin = bot.entity.position.offset(2, 0, 2),
    } = params;

    const item = bot.inventory.items().find(i => i.name === material);
    if (!item) throw new Error(`No ${material} in inventory`);

    let placed = 0;
    const positions = [];

    // Generate wall positions
    for (let y = 0; y < size.y; y++) {
      for (let x = 0; x < size.x; x++) {
        for (let z = 0; z < size.z; z++) {
          // Only walls and floor (not interior)
          const isWall = x === 0 || x === size.x - 1 || z === 0 || z === size.z - 1;
          const isFloor = y === 0;
          const isRoof = y === size.y - 1;

          if (isWall || isFloor || isRoof) {
            // Leave door gap
            if (x === Math.floor(size.x / 2) && z === 0 && y < 2) continue;

            positions.push(origin.offset(x, y, z));
          }
        }
      }
    }

    log.info(`Building ${size.x}x${size.y}x${size.z} box with ${material} (${positions.length} blocks)`);

    for (const pos of positions) {
      try {
        // Check if block already exists
        const existing = bot.blockAt(pos);
        if (existing && existing.name !== 'air') continue;

        await equipBlock(material);
        // Need a reference block to place against
        const ref = findAdjacentSolid(pos);
        if (ref) {
          const face = {
            x: pos.x - ref.position.x,
            y: pos.y - ref.position.y,
            z: pos.z - ref.position.z,
          };
          await bot.placeBlock(ref, face);
          placed++;
        }
      } catch {
        // Skip blocks we can't place
      }
    }

    log.info(`Box built: ${placed} blocks placed`);
    return placed;
  }

  async function buildWall(params) {
    const { length = 5, height = 3, material = 'cobblestone', direction = 'x' } = params;
    const origin = bot.entity.position.offset(2, 0, 0);
    let placed = 0;

    for (let h = 0; h < height; h++) {
      for (let i = 0; i < length; i++) {
        const pos = direction === 'x'
          ? origin.offset(i, h, 0)
          : origin.offset(0, h, i);

        try {
          await equipBlock(material);
          const ref = findAdjacentSolid(pos);
          if (ref) {
            const face = { x: pos.x - ref.position.x, y: pos.y - ref.position.y, z: pos.z - ref.position.z };
            await bot.placeBlock(ref, face);
            placed++;
          }
        } catch { /* skip */ }
      }
    }

    log.info(`Wall built: ${placed} blocks`);
    return placed;
  }

  async function buildTower(params) {
    const { height = 10, material = 'cobblestone' } = params;
    const origin = bot.entity.position;
    let placed = 0;

    for (let y = 0; y < height; y++) {
      try {
        await equipBlock(material);
        const below = bot.blockAt(origin.offset(0, y - 1, 0));
        if (below) {
          await bot.placeBlock(below, { x: 0, y: 1, z: 0 });
          placed++;
          // Jump on top
          bot.setControlState('jump', true);
          await new Promise(r => setTimeout(r, 400));
          bot.setControlState('jump', false);
        }
      } catch { /* skip */ }
    }

    log.info(`Tower built: ${placed} blocks high`);
    return placed;
  }

  async function buildFloor(params) {
    const { size = { x: 5, z: 5 }, material = 'cobblestone' } = params;
    const origin = bot.entity.position.offset(0, -1, 0);
    let placed = 0;

    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        try {
          const pos = origin.offset(x, 0, z);
          const existing = bot.blockAt(pos);
          if (existing && existing.name === 'air') {
            await equipBlock(material);
            const ref = findAdjacentSolid(pos);
            if (ref) {
              const face = { x: pos.x - ref.position.x, y: pos.y - ref.position.y, z: pos.z - ref.position.z };
              await bot.placeBlock(ref, face);
              placed++;
            }
          }
        } catch { /* skip */ }
      }
    }

    log.info(`Floor built: ${placed} blocks`);
    return placed;
  }

  async function equipBlock(blockName) {
    const item = bot.inventory.items().find(i => i.name === blockName);
    if (!item) throw new Error(`No ${blockName} in inventory`);
    await bot.equip(item, 'hand');
  }

  function findAdjacentSolid(position) {
    const offsets = [
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];

    for (const offset of offsets) {
      const block = bot.blockAt(position.offset(offset.x, offset.y, offset.z));
      if (block && block.boundingBox === 'block') {
        return block;
      }
    }

    return null;
  }

  return Object.freeze({
    placeBlock,
    buildStructure,
  });
}

export default createBuilding;
