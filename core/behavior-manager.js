// ClawCraft - Behavior Manager
// Orchestrates high-level autonomous behaviors (missions)
// A behavior is a long-running plan that coordinates multiple layers:
//   Perception -> Consciousness (1 LLM call) -> Planning -> Execution (no LLM) -> Reporting
//
// Example: "Guard the village" runs for hours with only 1-2 LLM calls total.
// The rest is pure reactive code + instincts + scheduled checks.

import { createLogger } from '../utils/logger.js';
import { uid } from '../utils/helpers.js';
import { EventCategory } from './event-bus.js';

const log = createLogger('BehaviorManager');

export const BehaviorState = Object.freeze({
  IDLE: 'idle',
  PLANNING: 'planning',      // LLM is generating the plan
  ACTIVE: 'active',           // Executing without LLM
  REACTING: 'reacting',       // Handling unexpected event (may call LLM)
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export function createBehaviorManager(bus, thinker, memoryManager, emotions) {
  let activeBehavior = null;
  let behaviorRegistry = new Map();
  let behaviorHistory = [];
  const MAX_HISTORY = 20;

  /**
   * Register a behavior type (e.g., 'guard-village', 'gather-resources')
   */
  function register(name, behaviorFactory) {
    behaviorRegistry.set(name, behaviorFactory);
    log.info(`Behavior registered: "${name}"`);
  }

  /**
   * Start a behavior from a player instruction
   * PASO 1: Perception already classified the message
   * PASO 2: This calls the LLM once to interpret and plan
   */
  async function startFromInstruction(instruction, context = {}) {
    if (activeBehavior && activeBehavior.state === BehaviorState.ACTIVE) {
      // Interrupt current behavior
      await stopCurrent('new_instruction');
    }

    const behaviorId = uid();

    activeBehavior = {
      id: behaviorId,
      state: BehaviorState.PLANNING,
      instruction: instruction.message,
      requester: instruction.username,
      startedAt: Date.now(),
      context,
      plan: null,
      handler: null,
      stats: { llmCalls: 0, eventsHandled: 0, tasksCompleted: 0 },
    };

    bus.emit('behavior:planning', {
      id: behaviorId,
      instruction: instruction.message,
      requester: instruction.username,
    }, EventCategory.AGENT);

    log.info(`Behavior planning: "${instruction.message}" (from ${instruction.username})`);

    try {
      // PASO 2 — CONSCIOUSNESS: Single LLM call to interpret + plan
      const plan = await thinker.planMission({
        instruction: instruction.message,
        username: instruction.username,
        position: memoryManager.working.getContext('position'),
        nearbyLocations: context.nearbyLocations ?? [],
        socialContext: context.socialContext ?? {},
        currentState: context.currentState ?? {},
      });

      activeBehavior.stats.llmCalls++;
      activeBehavior.plan = plan;

      // PASO 3 — PLANNING: Find matching behavior handler
      const behaviorType = identifyBehaviorType(plan);
      const factory = behaviorRegistry.get(behaviorType);

      if (!factory) {
        log.warn(`No handler for behavior type: ${behaviorType}, using generic`);
        activeBehavior.handler = createGenericHandler(plan);
      } else {
        activeBehavior.handler = factory(plan, context);
      }

      activeBehavior.state = BehaviorState.ACTIVE;

      // Send the LLM's response to chat
      if (plan.response) {
        bus.emit('chat:outgoing', { message: plan.response }, EventCategory.CHAT);
      }

      bus.emit('behavior:started', {
        id: behaviorId,
        name: plan.name,
        type: behaviorType,
      }, EventCategory.AGENT);

      log.info(`Behavior active: "${plan.name}" (type: ${behaviorType})`);

      // Record in memory
      memoryManager.episodic.record({
        type: 'behavior_started',
        description: `Started mission: "${plan.name}" - ${plan.interpretation}`,
        importance: 0.7,
        actors: [instruction.username],
        metadata: { plan },
      });

      return plan;
    } catch (err) {
      activeBehavior.state = BehaviorState.FAILED;
      log.error(`Behavior planning failed: ${err.message}`);
      bus.emit('chat:outgoing', {
        message: `No pude planificar eso: ${err.message}`,
      }, EventCategory.CHAT);
      return null;
    }
  }

  /**
   * Start a behavior directly by type name
   */
  async function startByType(typeName, params = {}) {
    const factory = behaviorRegistry.get(typeName);
    if (!factory) throw new Error(`Unknown behavior: ${typeName}`);

    if (activeBehavior && activeBehavior.state === BehaviorState.ACTIVE) {
      await stopCurrent('new_behavior');
    }

    const plan = {
      name: typeName,
      interpretation: `Direct ${typeName} behavior`,
      subtasks: [],
      ...params,
    };

    activeBehavior = {
      id: uid(),
      state: BehaviorState.ACTIVE,
      instruction: typeName,
      requester: 'self',
      startedAt: Date.now(),
      plan,
      handler: factory(plan, params),
      stats: { llmCalls: 0, eventsHandled: 0, tasksCompleted: 0 },
    };

    bus.emit('behavior:started', { id: activeBehavior.id, name: typeName }, EventCategory.AGENT);
    return plan;
  }

  /**
   * PASO 4 — Main tick: called by scheduler
   * Runs the behavior's tick function (pure code, no LLM)
   */
  async function tick() {
    if (!activeBehavior || activeBehavior.state !== BehaviorState.ACTIVE) return;
    if (!activeBehavior.handler) return;

    try {
      const result = await activeBehavior.handler.tick();

      if (result?.completed) {
        await completeCurrent(result.reason ?? 'task_done');
      }

      if (result?.tasksCompleted) {
        activeBehavior.stats.tasksCompleted += result.tasksCompleted;
      }
    } catch (err) {
      log.error(`Behavior tick error: ${err.message}`);
      activeBehavior.stats.eventsHandled++;
    }
  }

  /**
   * PASO 6 — Handle unexpected events during active behavior
   * Only calls LLM if the event is truly unexpected
   */
  async function handleUnexpectedEvent(event) {
    if (!activeBehavior || activeBehavior.state !== BehaviorState.ACTIVE) return;
    if (!activeBehavior.handler?.handleEvent) return;

    const handledLocally = activeBehavior.handler.handleEvent(event);

    if (!handledLocally) {
      // Event can't be handled by behavior logic alone -> ask LLM
      activeBehavior.state = BehaviorState.REACTING;
      log.info(`Unexpected event during behavior: ${event.name}`);

      try {
        const decision = await thinker.handleMissionEvent({
          event,
          mission: activeBehavior.plan,
          currentState: memoryManager.working.getContext(),
        });

        activeBehavior.stats.llmCalls++;

        if (decision?.actions) {
          bus.emit('thinker:actions', { actions: decision.actions }, EventCategory.AGENT);
        }
        if (decision?.say) {
          bus.emit('chat:outgoing', { message: decision.say }, EventCategory.CHAT);
        }

        activeBehavior.state = BehaviorState.ACTIVE;
      } catch (err) {
        log.error(`LLM reaction failed: ${err.message}`);
        activeBehavior.state = BehaviorState.ACTIVE;
      }
    }

    activeBehavior.stats.eventsHandled++;
  }

  /**
   * PASO 7 — Complete behavior and consolidate memory
   */
  async function completeCurrent(reason = 'completed') {
    if (!activeBehavior) return;

    const duration = Date.now() - activeBehavior.startedAt;
    const summary = activeBehavior.handler?.getSummary?.() ?? {};

    activeBehavior.state = BehaviorState.COMPLETED;

    // Record in episodic memory
    memoryManager.episodic.record({
      type: 'behavior_completed',
      description: `Completed mission: "${activeBehavior.plan.name}". ${summary.description ?? ''}`,
      importance: 0.8,
      emotionalValence: 0.3, // Positive - completed a task
      actors: [activeBehavior.requester],
      metadata: {
        duration,
        stats: activeBehavior.stats,
        summary,
        reason,
      },
    });

    // Emotional response: pride
    emotions.shift('pride', 0.15);
    emotions.shift('joy', 0.1);
    emotions.shift('determination', 0.05);

    // Archive
    behaviorHistory = [...behaviorHistory, { ...activeBehavior, completedAt: Date.now() }];
    if (behaviorHistory.length > MAX_HISTORY) {
      behaviorHistory = behaviorHistory.slice(-MAX_HISTORY);
    }

    bus.emit('behavior:completed', {
      id: activeBehavior.id,
      name: activeBehavior.plan.name,
      duration,
      stats: activeBehavior.stats,
      summary,
    }, EventCategory.AGENT);

    log.info(`Behavior completed: "${activeBehavior.plan.name}" (${Math.round(duration / 1000)}s, ${activeBehavior.stats.llmCalls} LLM calls)`);

    activeBehavior = null;
  }

  async function stopCurrent(reason = 'manual') {
    if (!activeBehavior) return;

    if (activeBehavior.handler?.cleanup) {
      await activeBehavior.handler.cleanup();
    }

    const name = activeBehavior.plan?.name ?? activeBehavior.instruction;
    activeBehavior.state = BehaviorState.COMPLETED;

    memoryManager.episodic.record({
      type: 'behavior_stopped',
      description: `Stopped mission: "${name}" (reason: ${reason})`,
      importance: 0.5,
      actors: [activeBehavior.requester],
    });

    behaviorHistory = [...behaviorHistory, { ...activeBehavior, completedAt: Date.now() }];
    activeBehavior = null;

    bus.emit('behavior:stopped', { name, reason }, EventCategory.AGENT);
    log.info(`Behavior stopped: "${name}" (${reason})`);
  }

  function identifyBehaviorType(plan) {
    const name = (plan.name ?? '').toLowerCase();
    const interp = (plan.interpretation ?? '').toLowerCase();
    const text = `${name} ${interp}`;

    if (text.includes('guard') || text.includes('protect') || text.includes('vigila') || text.includes('cuida') || text.includes('defiende')) {
      return 'guard-village';
    }
    if (text.includes('gather') || text.includes('collect') || text.includes('recolecta') || text.includes('junta')) {
      return 'gather-resources';
    }
    if (text.includes('build') || text.includes('construy') || text.includes('construir')) {
      return 'build-project';
    }
    if (text.includes('farm') || text.includes('cultiv')) {
      return 'farm-cycle';
    }
    if (text.includes('explore') || text.includes('explora') || text.includes('scout')) {
      return 'explore-area';
    }
    if (text.includes('follow') || text.includes('acompa') || text.includes('sigue')) {
      return 'follow-player';
    }

    return 'generic';
  }

  function createGenericHandler(plan) {
    return {
      tick: async () => null,
      handleEvent: () => true, // Handle everything locally (ignore)
      getSummary: () => ({ description: 'Generic behavior completed' }),
      cleanup: async () => {},
    };
  }

  function getActive() {
    return activeBehavior ? { ...activeBehavior, handler: undefined } : null;
  }

  function getHistory(limit = 10) {
    return behaviorHistory.slice(-limit).map(b => ({ ...b, handler: undefined }));
  }

  function getStatus() {
    return Object.freeze({
      active: activeBehavior ? {
        name: activeBehavior.plan?.name ?? activeBehavior.instruction,
        state: activeBehavior.state,
        duration: Date.now() - activeBehavior.startedAt,
        stats: activeBehavior.stats,
      } : null,
      registeredBehaviors: [...behaviorRegistry.keys()],
      historyCount: behaviorHistory.length,
    });
  }

  return Object.freeze({
    register,
    startFromInstruction,
    startByType,
    tick,
    handleUnexpectedEvent,
    completeCurrent,
    stopCurrent,
    getActive,
    getHistory,
    getStatus,
  });
}

export default createBehaviorManager;
