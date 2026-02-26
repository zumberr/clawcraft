// ClawCraft - World Model
// Persistent mental map: tracks blocks, structures, and points of interest

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';
import { blockPos, distance3D } from '../utils/helpers.js';

const log = createLogger('WorldModel');

export function createWorldModel(bot, bus) {
  // In-memory cache of interesting locations
  let pointsOfInterest = [];
  let knownStructures = [];
  let homePosition = null;
  let bedPosition = null;
  let lastUpdate = 0;

  function update() {
    const pos = bot.entity.position;
    detectBed(pos);
    detectContainers(pos);
    lastUpdate = Date.now();
  }

  function detectBed(center) {
    const radius = 8;
    for (let x = -radius; x <= radius; x++) {
      for (let y = -3; y <= 3; y++) {
        for (let z = -radius; z <= radius; z++) {
          const block = bot.blockAt(center.offset(x, y, z));
          if (block && block.name.includes('bed')) {
            const pos = block.position;
            if (!bedPosition || distance3D(pos, bedPosition) > 2) {
              bedPosition = { x: pos.x, y: pos.y, z: pos.z };
              addPointOfInterest('bed', bedPosition, 'rest');
              log.debug(`Bed found at (${pos.x}, ${pos.y}, ${pos.z})`);
            }
          }
        }
      }
    }
  }

  function detectContainers(center) {
    const radius = 6;
    const containerTypes = new Set(['chest', 'barrel', 'shulker_box', 'trapped_chest', 'ender_chest']);

    for (let x = -radius; x <= radius; x++) {
      for (let y = -3; y <= 3; y++) {
        for (let z = -radius; z <= radius; z++) {
          const block = bot.blockAt(center.offset(x, y, z));
          if (block && containerTypes.has(block.name)) {
            addPointOfInterest(block.name, block.position, 'storage');
          }
        }
      }
    }
  }

  function addPointOfInterest(type, position, category) {
    const existing = pointsOfInterest.find(p =>
      p.position.x === position.x &&
      p.position.y === position.y &&
      p.position.z === position.z
    );

    if (!existing) {
      const poi = Object.freeze({
        type,
        position: { x: position.x, y: position.y, z: position.z },
        category,
        discoveredAt: Date.now(),
      });
      pointsOfInterest = [...pointsOfInterest, poi];

      bus.emit('world:poiDiscovered', poi, EventCategory.WORLD);
    }
  }

  function setHome(position) {
    homePosition = { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
    addPointOfInterest('home', homePosition, 'base');
    log.info(`Home set at (${homePosition.x}, ${homePosition.y}, ${homePosition.z})`);

    bus.emit('world:homeSet', { position: homePosition }, EventCategory.WORLD);
  }

  function getBlockAt(position) {
    return bot.blockAt(position);
  }

  function findBlocks(name, maxDistance = 64, count = 1) {
    const mcData = require('minecraft-data')(bot.version);
    const blockType = mcData.blocksByName[name];
    if (!blockType) return [];

    return bot.findBlocks({
      matching: blockType.id,
      maxDistance,
      count,
    });
  }

  function getNearestPOI(category = null, fromPos = null) {
    const pos = fromPos ?? bot.entity.position;
    let pois = pointsOfInterest;

    if (category) {
      pois = pois.filter(p => p.category === category);
    }

    if (pois.length === 0) return null;

    return pois.reduce((nearest, poi) => {
      const dist = distance3D(pos, poi.position);
      const nearestDist = nearest ? distance3D(pos, nearest.position) : Infinity;
      return dist < nearestDist ? poi : nearest;
    }, null);
  }

  function getSnapshot() {
    return Object.freeze({
      position: bot.entity.position,
      homePosition,
      bedPosition,
      pointsOfInterest: [...pointsOfInterest],
      knownStructures: [...knownStructures],
      biome: bot.blockAt(bot.entity.position)?.biome?.name ?? 'unknown',
      dimension: bot.game.dimension,
      difficulty: bot.game.difficulty,
      lastUpdate,
    });
  }

  return Object.freeze({
    update,
    setHome,
    getBlockAt,
    findBlocks,
    addPointOfInterest,
    getNearestPOI,
    getSnapshot,
    getHome: () => homePosition,
    getBed: () => bedPosition,
  });
}

export default createWorldModel;
