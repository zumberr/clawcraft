// ClawCraft - Problem Solver
// Attempts to resolve stuck states and blocked tasks without LLM
// Uses heuristic strategies: retry, alternative, fallback, escalate
// Only escalates to LLM (via thinker) when all code-level strategies fail

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Autonomy:ProblemSolver');

const Strategy = Object.freeze({
  RETRY: 'retry',
  ALTERNATIVE: 'alternative',
  FALLBACK: 'fallback',
  SKIP: 'skip',
  ESCALATE: 'escalate',
});

const MAX_RETRIES = 3;
const STUCK_TIMEOUT_MS = 30000; // 30s without progress = stuck

export function createProblemSolver(bus, actions, memoryManager) {
  let failureLog = []; // { taskType, error, strategy, resolved, timestamp }
  const MAX_LOG = 100;

  /**
   * Attempt to resolve a failed task
   * Returns: { resolved, strategy, action?, reason }
   */
  function resolve(failedTask) {
    const { type, error, params, retryCount = 0 } = failedTask;

    log.info(`Resolving: ${type} (error: ${error?.message ?? error}, retries: ${retryCount})`);

    // Strategy 1: Simple retry (for transient failures)
    if (retryCount < MAX_RETRIES && isTransientError(error)) {
      logAttempt(type, error, Strategy.RETRY, true);
      return {
        resolved: true,
        strategy: Strategy.RETRY,
        action: { ...failedTask, retryCount: retryCount + 1 },
        reason: `Transient error, retrying (${retryCount + 1}/${MAX_RETRIES})`,
      };
    }

    // Strategy 2: Type-specific alternatives
    const alternative = findAlternative(type, params, error);
    if (alternative) {
      logAttempt(type, error, Strategy.ALTERNATIVE, true);
      return {
        resolved: true,
        strategy: Strategy.ALTERNATIVE,
        action: alternative,
        reason: `Using alternative approach: ${alternative.type}`,
      };
    }

    // Strategy 3: Fallback actions
    const fallback = findFallback(type, params, error);
    if (fallback) {
      logAttempt(type, error, Strategy.FALLBACK, true);
      return {
        resolved: true,
        strategy: Strategy.FALLBACK,
        action: fallback,
        reason: `Falling back to: ${fallback.type}`,
      };
    }

    // Strategy 4: Skip if non-critical
    if (isSkippable(type)) {
      logAttempt(type, error, Strategy.SKIP, true);
      return {
        resolved: true,
        strategy: Strategy.SKIP,
        action: null,
        reason: `Skipping non-critical task: ${type}`,
      };
    }

    // Strategy 5: Escalate to LLM
    logAttempt(type, error, Strategy.ESCALATE, false);
    return {
      resolved: false,
      strategy: Strategy.ESCALATE,
      action: null,
      reason: `Cannot resolve ${type} - escalating to consciousness`,
    };
  }

  function isTransientError(error) {
    const msg = error?.message ?? String(error);
    const transientPatterns = [
      'timeout', 'timed out',
      'path was not found',
      'cannot reach',
      'entity moved',
      'too far',
      'interrupted',
    ];
    return transientPatterns.some(p => msg.toLowerCase().includes(p));
  }

  function findAlternative(type, params, error) {
    const errMsg = error?.message ?? String(error);

    switch (type) {
      case 'mine': {
        // Can't mine? Try a different approach
        if (errMsg.includes('no tool')) {
          // Try to craft the needed tool first
          return {
            type: 'craft',
            params: { item: guessToolForBlock(params.block) },
            reason: 'Need tool to mine this block',
          };
        }
        if (errMsg.includes('cannot reach') || errMsg.includes('path')) {
          // Try mining from a different direction
          return {
            type: 'move',
            params: { target: params.position, offset: { x: 2, y: 0, z: 2 } },
            reason: 'Repositioning to reach block',
          };
        }
        break;
      }

      case 'move': {
        if (errMsg.includes('path') || errMsg.includes('cannot reach')) {
          // Try breaking blocking blocks
          return {
            type: 'mine',
            params: { block: 'obstacle', position: params.target },
            reason: 'Clearing path obstruction',
          };
        }
        break;
      }

      case 'build': {
        if (errMsg.includes('no blocks') || errMsg.includes('missing')) {
          // Try to gather the needed material
          return {
            type: 'gather',
            params: { item: params.block ?? 'cobblestone', count: 1 },
            reason: 'Gathering missing building material',
          };
        }
        break;
      }

      case 'craft': {
        if (errMsg.includes('missing') || errMsg.includes('not enough')) {
          // Try gathering ingredients
          return {
            type: 'gather',
            params: { item: 'raw_materials' },
            reason: 'Gathering crafting ingredients',
          };
        }
        break;
      }

      case 'farm': {
        if (errMsg.includes('no seeds')) {
          return {
            type: 'gather',
            params: { item: 'seeds' },
            reason: 'Need seeds for farming',
          };
        }
        break;
      }

      default:
        break;
    }

    return null;
  }

  function findFallback(type, params, error) {
    switch (type) {
      case 'mine':
        // Fallback: just collect surface resources
        return {
          type: 'gather',
          params: { item: 'any', radius: 16 },
          reason: 'Falling back to surface gathering',
        };

      case 'build':
        // Fallback: skip this block placement
        return null; // Will be skipped

      case 'farm':
        // Fallback: try basic foraging
        return {
          type: 'gather',
          params: { item: 'food', radius: 32 },
          reason: 'Falling back to foraging for food',
        };

      default:
        return null;
    }
  }

  function isSkippable(type) {
    // Non-critical tasks that can be safely skipped
    const skippable = new Set([
      'say', 'look', 'wait', 'interact', 'store',
    ]);
    return skippable.has(type);
  }

  function guessToolForBlock(blockName) {
    if (!blockName) return 'wooden_pickaxe';

    const block = blockName.toLowerCase();
    if (block.includes('log') || block.includes('plank')) return 'wooden_axe';
    if (block.includes('dirt') || block.includes('sand') || block.includes('gravel')) return 'wooden_shovel';
    if (block.includes('stone') || block.includes('ore') || block.includes('cobble')) return 'wooden_pickaxe';
    return 'wooden_pickaxe';
  }

  /**
   * Detect if the bot is stuck (no position change for STUCK_TIMEOUT_MS)
   */
  function detectStuck(currentPos, lastPos, lastMoveTime) {
    if (!lastPos) return false;

    const dx = Math.abs(currentPos.x - lastPos.x);
    const dy = Math.abs(currentPos.y - lastPos.y);
    const dz = Math.abs(currentPos.z - lastPos.z);

    const hasntMoved = dx < 0.5 && dy < 0.5 && dz < 0.5;
    const timeElapsed = Date.now() - lastMoveTime;

    return hasntMoved && timeElapsed > STUCK_TIMEOUT_MS;
  }

  /**
   * Try to get unstuck
   */
  function getUnstuck() {
    const strategies = [
      { action: 'jump', params: {}, reason: 'Jump to get unstuck' },
      { action: 'move', params: { direction: 'random', distance: 5 }, reason: 'Random movement' },
      { action: 'mine', params: { direction: 'down', count: 1 }, reason: 'Dig down to clear path' },
    ];

    const choice = strategies[Math.floor(Math.random() * strategies.length)];
    log.info(`Getting unstuck: ${choice.reason}`);
    return choice;
  }

  function logAttempt(taskType, error, strategy, resolved) {
    failureLog.push({
      taskType,
      error: error?.message ?? String(error),
      strategy,
      resolved,
      timestamp: Date.now(),
    });

    if (failureLog.length > MAX_LOG) {
      failureLog = failureLog.slice(-MAX_LOG);
    }
  }

  function getStats() {
    const total = failureLog.length;
    const resolved = failureLog.filter(f => f.resolved).length;
    const byStrategy = {};

    for (const entry of failureLog) {
      byStrategy[entry.strategy] = (byStrategy[entry.strategy] ?? 0) + 1;
    }

    return Object.freeze({
      totalFailures: total,
      resolved,
      escalated: total - resolved,
      resolutionRate: total > 0 ? (resolved / total * 100).toFixed(1) + '%' : 'N/A',
      byStrategy,
    });
  }

  return Object.freeze({
    resolve,
    detectStuck,
    getUnstuck,
    getStats,
    Strategy,
  });
}

export default createProblemSolver;
