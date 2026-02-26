// ClawCraft - Plan Executor
// Executes tasks from the queue by dispatching to the right action module

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('PlanExecutor');

export function createPlanExecutor(actions, bus, taskQueue) {
  let executing = false;
  let interrupted = false;

  // Map task types to action handlers
  const handlers = {
    move: executeMove,
    mine: executeMine,
    build: executeBuild,
    craft: executeCraft,
    gather: executeGather,
    farm: executeFarm,
    combat: executeCombat,
    interact: executeInteract,
    equip: executeEquip,
    store: executeStore,
    say: executeSay,
    wait: executeWait,
    look: executeLook,
    custom: executeCustom,
  };

  async function tick() {
    if (executing || interrupted) return;

    const task = taskQueue.getCurrent() ?? taskQueue.dequeue();
    if (!task) return;

    executing = true;
    const handler = handlers[task.type] ?? executeCustom;

    try {
      bus.emit('task:started', { task }, EventCategory.TASK);
      const result = await handler(task);
      taskQueue.completeCurrent(result);
      bus.emit('task:completed', { task, result }, EventCategory.TASK);
    } catch (err) {
      log.error(`Task execution failed: ${err.message}`);
      taskQueue.failCurrent(err.message);
      bus.emit('task:failed', { task, error: err.message }, EventCategory.TASK);
    } finally {
      executing = false;
    }
  }

  function interrupt(reason = 'manual') {
    interrupted = true;
    log.warn(`Execution interrupted: ${reason}`);
    bus.emit('task:interrupted', { reason }, EventCategory.TASK);

    // Resume after a brief pause
    setTimeout(() => { interrupted = false; }, 2000);
  }

  // Listen for critical events that should interrupt
  bus.on('classified:critical', () => {
    if (executing) {
      interrupt('critical_event');
    }
  });

  bus.on('instinct:flee', () => {
    if (executing) {
      interrupt('flee_instinct');
    }
  });

  // --- Task Handlers ---

  async function executeMove(task) {
    const { target, position, radius } = task.params;

    if (position) {
      await actions.movement.goTo(position);
    } else if (target) {
      await actions.movement.goToBlock(target, radius ?? 32);
    }

    return { arrived: true };
  }

  async function executeMine(task) {
    const { block, count = 1 } = task.params;
    const mined = await actions.mining.mineBlock(block, count);
    return { mined };
  }

  async function executeBuild(task) {
    const { item, position, structure } = task.params;

    if (structure) {
      await actions.building.buildStructure(structure, task.params);
    } else if (item && position) {
      await actions.building.placeBlock(item, position);
    }

    return { built: true };
  }

  async function executeCraft(task) {
    const { item, count = 1 } = task.params;
    const crafted = await actions.crafting.craft(item, count);
    return { crafted };
  }

  async function executeGather(task) {
    const { item, radius = 16 } = task.params;
    await actions.movement.collectDrops(radius);
    return { gathered: true };
  }

  async function executeFarm(task) {
    const { action = 'harvest', crop } = task.params;
    if (action === 'harvest') {
      await actions.farming.harvest(crop);
    } else if (action === 'plant') {
      await actions.farming.plant(crop);
    }
    return { farmed: true };
  }

  async function executeCombat(task) {
    const { target } = task.params;
    return { combat: 'delegated_to_instinct' };
  }

  async function executeInteract(task) {
    const { target, action } = task.params;
    await actions.interaction.interact(target, action);
    return { interacted: true };
  }

  async function executeEquip(task) {
    const { item, destination = 'hand' } = task.params;
    await actions.inventory.equip(item, destination);
    return { equipped: true };
  }

  async function executeStore(task) {
    const { item, container } = task.params;
    await actions.inventory.storeInChest(item, container);
    return { stored: true };
  }

  async function executeSay(task) {
    const { message } = task.params;
    bus.emit('chat:outgoing', { message }, EventCategory.CHAT);
    return { said: message };
  }

  async function executeWait(task) {
    const { duration = 5000 } = task.params;
    await new Promise(resolve => setTimeout(resolve, duration));
    return { waited: duration };
  }

  async function executeLook(task) {
    const { position, entity } = task.params;
    if (position) {
      await actions.movement.lookAt(position);
    }
    return { looked: true };
  }

  async function executeCustom(task) {
    log.info(`Custom task: "${task.name}" - needs LLM decomposition`);
    bus.emit('task:needsDecomposition', { task }, EventCategory.TASK);
    return { custom: true, needsLLM: true };
  }

  function getStatus() {
    return Object.freeze({
      executing,
      interrupted,
      queue: taskQueue.getStatus(),
    });
  }

  return Object.freeze({
    tick,
    interrupt,
    resume: () => { interrupted = false; },
    getStatus,
  });
}

export default createPlanExecutor;
