// ClawCraft - Sensors
// Eyes and ears: reads the world state and emits raw events

import { createLogger } from "../utils/logger.js";
import { formatPos, distance3D } from "../utils/helpers.js";
import { EventCategory } from "../core/event-bus.js";

const log = createLogger("Sensors");

const SCAN_RADIUS = 32;
const ENTITY_RADIUS = 48;

export function createSensors(bot, bus) {
  let lastHealth = 20;
  let lastFood = 20;
  let lastInventoryFull = false;
  let lastPosition = null;
  let lastTimeOfDay = null;
  let nearbyEntities = [];
  let nearbyPlayers = [];

  function scanHealth() {
    const health = bot.health;
    const food = bot.food;

    if (health !== lastHealth) {
      const delta = health - lastHealth;
      const payload = {
        health,
        previousHealth: lastHealth,
        delta,
        amount: Math.abs(delta),
        changeType: delta < 0 ? "damage" : "heal",
      };

      bus.emit("health:changed", payload, EventCategory.HEALTH);
      bus.emit(
        delta < 0 ? "health:damage" : "health:heal",
        payload,
        EventCategory.HEALTH,
      );
      lastHealth = health;
    }

    if (food !== lastFood) {
      const payload = {
        food,
        previousFood: lastFood,
        saturation: bot.foodSaturation,
        delta: food - lastFood,
      };

      bus.emit("food:changed", payload, EventCategory.HEALTH);
      bus.emit("health:hunger", payload, EventCategory.HEALTH);
      lastFood = food;
    }
  }

  function scanEntities() {
    const pos = bot.entity.position;
    const entities = Object.values(bot.entities);

    const hostile = [];
    const passive = [];
    const players = [];
    const items = [];

    for (const entity of entities) {
      if (entity === bot.entity) continue;
      const dist = distance3D(pos, entity.position);
      if (dist > ENTITY_RADIUS) continue;

      const info = {
        id: entity.id,
        type: entity.type,
        name: entity.name ?? entity.displayName ?? entity.username ?? "unknown",
        position: entity.position,
        distance: Math.round(dist * 10) / 10,
        health: entity.health,
      };

      switch (entity.type) {
        case "player":
          players.push(info);
          break;
        case "mob":
          if (isHostile(entity)) {
            hostile.push(info);
          } else {
            passive.push(info);
          }
          break;
        case "object":
          items.push(info);
          break;
      }
    }

    // Emit if new players appeared
    for (const player of players) {
      const wasNearby = nearbyPlayers.find((p) => p.name === player.name);
      if (!wasNearby) {
        bus.emit("entity:playerAppeared", player, EventCategory.ENTITY);
        log.info(
          `Player appeared: ${player.name} at ${formatPos(player.position)}`,
        );
      }
    }

    for (const previousPlayer of nearbyPlayers) {
      const isStillNearby = players.find(
        (player) => player.name === previousPlayer.name,
      );
      if (!isStillNearby) {
        bus.emit("entity:playerLeft", previousPlayer, EventCategory.ENTITY);
        log.info(`Player left: ${previousPlayer.name}`);
      }
    }

    // Emit if hostile mobs are close
    const closestHostile = hostile.sort((a, b) => a.distance - b.distance)[0];
    if (closestHostile && closestHostile.distance < 16) {
      bus.emit(
        "entity:hostileNearby",
        {
          ...closestHostile,
          count: hostile.filter((entity) => entity.distance < 16).length,
        },
        EventCategory.COMBAT,
      );
    }

    nearbyEntities = [...hostile, ...passive, ...players, ...items];
    nearbyPlayers = players;

    return { hostile, passive, players, items };
  }

  function scanEnvironment() {
    const pos = bot.entity.position;
    const timeOfDay = bot.time.timeOfDay;
    const isDay = timeOfDay < 12000;
    const isRaining = bot.isRaining;
    const dimension = bot.game.dimension;

    // Time change
    const wasDay = lastTimeOfDay !== null ? lastTimeOfDay < 12000 : null;
    if (wasDay !== null && wasDay !== isDay) {
      bus.emit(
        "world:timeChange",
        {
          isDay,
          timeOfDay,
        },
        EventCategory.WORLD,
      );
      log.info(isDay ? "Day has begun" : "Night has fallen");
    }
    lastTimeOfDay = timeOfDay;

    bus.emit(
      "world:timeUpdate",
      {
        time: timeOfDay,
        timeOfDay,
        isDay,
        isRaining,
        dimension,
        position: { x: pos.x, y: pos.y, z: pos.z },
      },
      EventCategory.WORLD,
    );

    // Position tracking
    if (lastPosition && distance3D(pos, lastPosition) > 5) {
      bus.emit(
        "agent:moved",
        {
          from: lastPosition,
          to: pos,
          distance: distance3D(pos, lastPosition),
        },
        EventCategory.AGENT,
      );
    }
    lastPosition = { x: pos.x, y: pos.y, z: pos.z };

    return { position: pos, timeOfDay, isDay, isRaining, dimension };
  }

  function scanInventory() {
    const items = bot.inventory.items();
    return items.map((item) => ({
      name: item.name,
      displayName: item.displayName,
      count: item.count,
      slot: item.slot,
    }));
  }

  function scanInventoryState() {
    const items = scanInventory();
    const emptySlots = bot.inventory.emptySlotCount();
    const isFull = emptySlots === 0;

    if (isFull && !lastInventoryFull) {
      bus.emit(
        "inventory:full",
        {
          items,
          emptySlots,
        },
        EventCategory.INVENTORY,
      );
    } else if (!isFull && lastInventoryFull) {
      bus.emit(
        "inventory:spaceAvailable",
        {
          emptySlots,
        },
        EventCategory.INVENTORY,
      );
    }

    lastInventoryFull = isFull;

    return Object.freeze({
      items,
      emptySlots,
      isFull,
    });
  }

  function scan() {
    scanHealth();
    const entities = scanEntities();
    const env = scanEnvironment();
    const inventory = scanInventoryState();

    return Object.freeze({
      entities,
      environment: env,
      inventory,
      health: bot.health,
      food: bot.food,
      position: bot.entity.position,
      experience: bot.experience,
    });
  }

  function getNearbyEntities() {
    return [...nearbyEntities];
  }

  function getNearbyPlayers() {
    return [...nearbyPlayers];
  }

  return Object.freeze({
    scan,
    scanHealth,
    scanEntities,
    scanEnvironment,
    scanInventory,
    scanInventoryState,
    getNearbyEntities,
    getNearbyPlayers,
  });
}

function isHostile(entity) {
  const hostileMobs = new Set([
    "zombie",
    "skeleton",
    "creeper",
    "spider",
    "enderman",
    "witch",
    "slime",
    "phantom",
    "drowned",
    "husk",
    "stray",
    "blaze",
    "ghast",
    "wither_skeleton",
    "pillager",
    "vindicator",
    "evoker",
    "ravager",
    "hoglin",
    "piglin_brute",
    "warden",
    "breeze",
  ]);
  return hostileMobs.has(entity.name);
}

export default createSensors;
