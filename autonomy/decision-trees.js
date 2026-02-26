// ClawCraft - Decision Trees
// Code-only decision logic for common situations
// Autonomy Level 1: resolve alone, Level 2: resolve + inform, Level 3: ask player
// No LLM calls - pure conditional logic based on state

import { createLogger } from '../utils/logger.js';
import { distance3D } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Autonomy:DecisionTrees');

const AutonomyLevel = Object.freeze({
  SILENT: 1,   // Resolve alone, don't inform
  INFORM: 2,   // Resolve alone, inform player
  ASK: 3,      // Ask player before acting
});

export function createDecisionTrees(bus, memoryManager, emotions) {

  /**
   * Decide what to do when health is low
   * Returns: { action, autonomy, reason }
   */
  function onLowHealth(state) {
    const { health, food, hasFood, nearestHostile, homeDistance } = state;

    // Critical health (< 4) - always flee (Level 1)
    if (health < 4) {
      if (nearestHostile && nearestHostile.distance < 16) {
        return {
          action: 'flee',
          params: { direction: 'away_from_hostile' },
          autonomy: AutonomyLevel.SILENT,
          reason: 'Critical health, hostile nearby - fleeing',
        };
      }
      return {
        action: 'shelter',
        params: {},
        autonomy: AutonomyLevel.SILENT,
        reason: 'Critical health - seeking shelter',
      };
    }

    // Low health (< 10) with food - eat (Level 1)
    if (health < 10 && hasFood) {
      return {
        action: 'eat',
        params: {},
        autonomy: AutonomyLevel.SILENT,
        reason: 'Low health - eating to regenerate',
      };
    }

    // Low health, no food, near home - go home (Level 2)
    if (health < 10 && !hasFood && homeDistance < 100) {
      return {
        action: 'go_home',
        params: {},
        autonomy: AutonomyLevel.INFORM,
        reason: 'Low health, no food - returning home for supplies',
      };
    }

    // Low health, no food, far from home - inform player (Level 3)
    if (health < 10 && !hasFood) {
      return {
        action: 'request_help',
        params: {},
        autonomy: AutonomyLevel.ASK,
        reason: 'Low health, no food, far from home - need assistance',
      };
    }

    return null;
  }

  /**
   * Decide what to do when inventory is full
   */
  function onInventoryFull(state) {
    const { nearestChest, homeDistance, currentTask } = state;

    // Near a chest - auto-store (Level 1)
    if (nearestChest && nearestChest.distance < 16) {
      return {
        action: 'store_items',
        params: { target: nearestChest.position },
        autonomy: AutonomyLevel.SILENT,
        reason: 'Inventory full - storing in nearby chest',
      };
    }

    // Home is close - go store (Level 2)
    if (homeDistance < 64) {
      return {
        action: 'go_store',
        params: { target: 'home' },
        autonomy: AutonomyLevel.INFORM,
        reason: 'Inventory full - going home to store items',
      };
    }

    // Far from storage - drop low-value items (Level 2)
    return {
      action: 'drop_junk',
      params: {},
      autonomy: AutonomyLevel.INFORM,
      reason: 'Inventory full, no storage nearby - dropping low-value items',
    };
  }

  /**
   * Decide what to do when night falls
   */
  function onNightfall(state) {
    const { hasBed, homeDistance, currentTask, armorLevel, hasWeapon } = state;

    // Has active guard mission - stay out (Level 1)
    if (currentTask === 'guard') {
      return {
        action: 'continue_task',
        params: {},
        autonomy: AutonomyLevel.SILENT,
        reason: 'Night falls but guarding - continuing patrol',
      };
    }

    // Well-equipped - can stay out (Level 1)
    if (armorLevel >= 3 && hasWeapon) {
      return {
        action: 'continue_task',
        params: {},
        autonomy: AutonomyLevel.SILENT,
        reason: 'Night falls but well-equipped - continuing',
      };
    }

    // Has bed nearby - sleep (Level 1)
    if (hasBed && homeDistance < 64) {
      return {
        action: 'go_sleep',
        params: {},
        autonomy: AutonomyLevel.SILENT,
        reason: 'Night falls - going to bed',
      };
    }

    // No bed, poorly equipped - seek shelter (Level 2)
    return {
      action: 'seek_shelter',
      params: {},
      autonomy: AutonomyLevel.INFORM,
      reason: 'Night falls, no bed nearby - seeking shelter',
    };
  }

  /**
   * Decide response to unknown player
   */
  function onUnknownPlayer(state) {
    const { playerName, playerDistance, masterPresent, emotionalState } = state;
    const social = memoryManager.social.recall(playerName);

    // Already known and trusted
    if (social && social.trustLevel >= 0.5) {
      return {
        action: 'greet',
        params: { player: playerName, message: 'friendly' },
        autonomy: AutonomyLevel.SILENT,
        reason: `Known player ${playerName} - greeting`,
      };
    }

    // Master is present - let master handle
    if (masterPresent) {
      return {
        action: 'alert_master',
        params: { player: playerName },
        autonomy: AutonomyLevel.INFORM,
        reason: `Unknown player ${playerName} - alerting master`,
      };
    }

    // Player is far - just watch
    if (playerDistance > 24) {
      return {
        action: 'observe',
        params: { player: playerName },
        autonomy: AutonomyLevel.SILENT,
        reason: `Unknown player ${playerName} far away - observing`,
      };
    }

    // Player is close, no master - cautious greeting (Level 2)
    return {
      action: 'cautious_greet',
      params: { player: playerName },
      autonomy: AutonomyLevel.INFORM,
      reason: `Unknown player ${playerName} approaching - cautious greeting`,
    };
  }

  /**
   * Decide what to do when tool breaks
   */
  function onToolBroken(state) {
    const { toolType, hasCraftingTable, hasResources, currentTask } = state;

    // Has resources + crafting table -> craft replacement (Level 1)
    if (hasResources && hasCraftingTable) {
      return {
        action: 'craft_tool',
        params: { toolType },
        autonomy: AutonomyLevel.SILENT,
        reason: `Tool broken - crafting replacement ${toolType}`,
      };
    }

    // Has resources, no table nearby -> make one (Level 1)
    if (hasResources) {
      return {
        action: 'craft_table_then_tool',
        params: { toolType },
        autonomy: AutonomyLevel.SILENT,
        reason: `Tool broken - crafting table then ${toolType}`,
      };
    }

    // No resources -> inform (Level 2)
    return {
      action: 'request_resources',
      params: { toolType },
      autonomy: AutonomyLevel.INFORM,
      reason: `Tool broken, no resources for ${toolType}`,
    };
  }

  /**
   * Decide what to do when hungry
   */
  function onHungry(state) {
    const { food, hasFood, nearestCrop, homeDistance } = state;

    // Has food -> eat (Level 1)
    if (hasFood) {
      return {
        action: 'eat',
        params: {},
        autonomy: AutonomyLevel.SILENT,
        reason: 'Hungry - eating',
      };
    }

    // Mature crops nearby -> harvest (Level 1)
    if (nearestCrop && nearestCrop.distance < 32) {
      return {
        action: 'harvest_food',
        params: { position: nearestCrop.position },
        autonomy: AutonomyLevel.SILENT,
        reason: 'Hungry, no food - harvesting nearby crops',
      };
    }

    // Home is close -> go get food (Level 2)
    if (homeDistance < 64) {
      return {
        action: 'go_home_food',
        params: {},
        autonomy: AutonomyLevel.INFORM,
        reason: 'Hungry, no food nearby - going home for supplies',
      };
    }

    // Nothing available -> inform (Level 2)
    return {
      action: 'report_hunger',
      params: {},
      autonomy: AutonomyLevel.INFORM,
      reason: 'Hungry, no food sources available',
    };
  }

  /**
   * Master decision dispatcher - evaluates all trees for current state
   */
  function evaluate(state) {
    const decisions = [];

    if (state.health < 10) {
      const d = onLowHealth(state);
      if (d) decisions.push({ ...d, priority: 10 });
    }

    if (state.food < 6) {
      const d = onHungry(state);
      if (d) decisions.push({ ...d, priority: 8 });
    }

    if (state.inventoryFull) {
      const d = onInventoryFull(state);
      if (d) decisions.push({ ...d, priority: 5 });
    }

    if (state.nightFalling) {
      const d = onNightfall(state);
      if (d) decisions.push({ ...d, priority: 6 });
    }

    if (state.toolBroken) {
      const d = onToolBroken(state);
      if (d) decisions.push({ ...d, priority: 7 });
    }

    // Sort by priority (highest first)
    decisions.sort((a, b) => b.priority - a.priority);

    return decisions[0] ?? null;
  }

  return Object.freeze({
    evaluate,
    onLowHealth,
    onInventoryFull,
    onNightfall,
    onUnknownPlayer,
    onToolBroken,
    onHungry,
    AutonomyLevel,
  });
}

export default createDecisionTrees;
