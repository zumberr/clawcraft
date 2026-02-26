// ClawCraft - Task Decomposer
// Breaks high-level goals into executable tasks using known recipes and strategies

import { createLogger } from '../utils/logger.js';
import { uid } from '../utils/helpers.js';

const log = createLogger('TaskDecomposer');

export const TaskType = Object.freeze({
  MOVE: 'move',
  MINE: 'mine',
  BUILD: 'build',
  CRAFT: 'craft',
  SMELT: 'smelt',
  FARM: 'farm',
  COMBAT: 'combat',
  GATHER: 'gather',
  INTERACT: 'interact',
  WAIT: 'wait',
  LOOK: 'look',
  SAY: 'say',
  EQUIP: 'equip',
  STORE: 'store',
  CUSTOM: 'custom',
});

// Common task templates
const TEMPLATES = {
  'get_wood': [
    { type: TaskType.MOVE, name: 'Find nearest tree', params: { target: 'oak_log', radius: 32 } },
    { type: TaskType.MINE, name: 'Chop tree', params: { block: 'oak_log', count: 4 } },
    { type: TaskType.GATHER, name: 'Pick up drops', params: { item: 'oak_log' } },
  ],
  'make_crafting_table': [
    { type: TaskType.CRAFT, name: 'Make planks', params: { item: 'oak_planks', count: 4, from: 'oak_log' } },
    { type: TaskType.CRAFT, name: 'Make crafting table', params: { item: 'crafting_table', count: 1 } },
  ],
  'make_wooden_tools': [
    { type: TaskType.CRAFT, name: 'Make planks', params: { item: 'oak_planks', count: 8 } },
    { type: TaskType.CRAFT, name: 'Make sticks', params: { item: 'stick', count: 4 } },
    { type: TaskType.CRAFT, name: 'Make wooden pickaxe', params: { item: 'wooden_pickaxe', count: 1 } },
    { type: TaskType.CRAFT, name: 'Make wooden axe', params: { item: 'wooden_axe', count: 1 } },
    { type: TaskType.CRAFT, name: 'Make wooden sword', params: { item: 'wooden_sword', count: 1 } },
  ],
  'make_stone_tools': [
    { type: TaskType.MINE, name: 'Mine cobblestone', params: { block: 'stone', count: 11 } },
    { type: TaskType.CRAFT, name: 'Make stone pickaxe', params: { item: 'stone_pickaxe', count: 1 } },
    { type: TaskType.CRAFT, name: 'Make stone axe', params: { item: 'stone_axe', count: 1 } },
    { type: TaskType.CRAFT, name: 'Make stone sword', params: { item: 'stone_sword', count: 1 } },
    { type: TaskType.CRAFT, name: 'Make furnace', params: { item: 'furnace', count: 1 } },
  ],
  'build_shelter': [
    { type: TaskType.MINE, name: 'Gather blocks', params: { block: 'dirt', count: 20 } },
    { type: TaskType.BUILD, name: 'Build walls', params: { structure: 'box', size: { x: 5, y: 3, z: 5 } } },
    { type: TaskType.BUILD, name: 'Add door', params: { item: 'oak_door' } },
    { type: TaskType.CRAFT, name: 'Make bed', params: { item: 'white_bed', count: 1 } },
    { type: TaskType.BUILD, name: 'Place bed', params: { item: 'white_bed' } },
  ],
};

export function createTaskDecomposer(actions, semanticMemory) {
  /**
   * Decompose a goal name into a list of executable tasks
   */
  function decompose(goalName, params = {}) {
    // Check templates first
    const templateKey = goalName.toLowerCase().replace(/\s+/g, '_');
    if (TEMPLATES[templateKey]) {
      return TEMPLATES[templateKey].map(t => createTask(t));
    }

    // Check semantic memory for known strategies
    const strategy = semanticMemory.recall('strategy', templateKey);
    if (strategy) {
      log.info(`Using learned strategy for "${goalName}"`);
      // Parse strategy into steps (simplified)
      return parseStrategy(strategy.value);
    }

    // Create a single custom task if we can't decompose
    return [createTask({
      type: TaskType.CUSTOM,
      name: goalName,
      params,
    })];
  }

  function createTask(template) {
    return Object.freeze({
      id: uid(),
      type: template.type,
      name: template.name,
      params: template.params ?? {},
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
    });
  }

  function parseStrategy(strategyStr) {
    if (typeof strategyStr !== 'string') return [];

    const steps = strategyStr.split('->').map(s => s.trim());
    return steps.map(step => createTask({
      type: TaskType.CUSTOM,
      name: step,
      params: { fromStrategy: true },
    }));
  }

  /**
   * Estimate resources needed for a goal
   */
  function estimateResources(goalName) {
    const templateKey = goalName.toLowerCase().replace(/\s+/g, '_');
    const tasks = TEMPLATES[templateKey];

    if (!tasks) return { unknown: true };

    const resources = {};
    for (const task of tasks) {
      if (task.params?.block) {
        resources[task.params.block] = (resources[task.params.block] || 0) + (task.params.count || 1);
      }
      if (task.params?.from) {
        resources[task.params.from] = (resources[task.params.from] || 0) + (task.params.count || 1);
      }
    }

    return resources;
  }

  function getAvailableTemplates() {
    return Object.keys(TEMPLATES);
  }

  return Object.freeze({
    decompose,
    estimateResources,
    getAvailableTemplates,
  });
}

export default createTaskDecomposer;
