// ClawCraft - Scheduler
// Main loop: ticks perception, instincts, planning, and consciousness at different rates

import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';

const log = createLogger('Scheduler');

/**
 * Task frequencies relative to base tick
 */
const TickGroup = Object.freeze({
  EVERY_TICK: 1,        // Instincts, sensors (50ms)
  FAST: 4,              // World model updates (200ms)
  MEDIUM: 20,           // Planning checks (1s)
  SLOW: 100,            // Memory consolidation (5s)
  VERY_SLOW: 600,       // Reflection (30s)
});

export function createScheduler(tickRate = 50) {
  let running = false;
  let tickCount = 0;
  let tasks = [];
  let paused = false;

  function register(name, fn, group = TickGroup.EVERY_TICK) {
    tasks = [...tasks, { name, fn, group, enabled: true, lastError: null, executionTime: 0 }];
    log.debug(`Registered task: ${name} (every ${group} ticks)`);
  }

  function unregister(name) {
    tasks = tasks.filter(t => t.name !== name);
  }

  function enable(name) {
    tasks = tasks.map(t => t.name === name ? { ...t, enabled: true } : t);
  }

  function disable(name) {
    tasks = tasks.map(t => t.name === name ? { ...t, enabled: false } : t);
  }

  async function tick() {
    tickCount++;

    for (const task of tasks) {
      if (!task.enabled) continue;
      if (tickCount % task.group !== 0) continue;

      const start = performance.now();
      try {
        await task.fn(tickCount);
        task.executionTime = performance.now() - start;
        task.lastError = null;
      } catch (err) {
        task.lastError = err.message;
        task.executionTime = performance.now() - start;
        log.error(`Task ${task.name} failed: ${err.message}`);
      }
    }
  }

  async function start() {
    if (running) return;
    running = true;
    log.info(`Scheduler started (tick rate: ${tickRate}ms, tasks: ${tasks.length})`);

    while (running) {
      if (!paused) {
        await tick();
      }
      await sleep(tickRate);
    }

    log.info('Scheduler stopped');
  }

  function stop() {
    running = false;
  }

  function pause() {
    paused = true;
    log.info('Scheduler paused');
  }

  function resume() {
    paused = false;
    log.info('Scheduler resumed');
  }

  function getStatus() {
    return Object.freeze({
      running,
      paused,
      tickCount,
      tasks: tasks.map(t => ({
        name: t.name,
        group: t.group,
        enabled: t.enabled,
        lastError: t.lastError,
        executionTimeMs: Math.round(t.executionTime * 100) / 100,
      })),
    });
  }

  return Object.freeze({
    register,
    unregister,
    enable,
    disable,
    start,
    stop,
    pause,
    resume,
    getStatus,
    TickGroup,
  });
}

export { TickGroup };
export default createScheduler;
