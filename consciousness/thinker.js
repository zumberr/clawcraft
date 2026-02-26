// ClawCraft - Thinker
// Decides WHEN to think and WHAT to ask the LLM
// Rate-limits LLM calls, prioritizes what needs conscious thought

import { createLogger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Thinker');

export function createThinker(llm, promptBuilder, bus, memoryManager) {
  let lastThinkTime = 0;
  let thinkCooldownMs = 10000; // Min 10s between thoughts
  let pendingQuestions = [];
  let isThinking = false;
  let conversationHistory = [];
  const MAX_HISTORY = 20;

  /**
   * Main think loop - called by scheduler
   */
  async function think() {
    if (isThinking) return;

    const now = Date.now();
    if (now - lastThinkTime < thinkCooldownMs) return;

    // Check if there's something worth thinking about
    const stimulus = getHighestPriorityStimulus();
    if (!stimulus) return;

    isThinking = true;
    lastThinkTime = now;

    try {
      const response = await processStimulus(stimulus);
      if (response) {
        handleResponse(response, stimulus);
      }
    } catch (err) {
      log.error(`Thinking failed: ${err.message}`);
    } finally {
      isThinking = false;
    }
  }

  function getHighestPriorityStimulus() {
    // Priority 1: Pending questions from players
    if (pendingQuestions.length > 0) {
      return pendingQuestions.shift();
    }

    // Priority 2: Tasks that need decomposition
    const activeTask = memoryManager.working.getActiveTask();
    if (activeTask?.needsLLM) {
      return { type: 'task_decomposition', task: activeTask };
    }

    // Priority 3: No active task and idle - think autonomously
    if (!activeTask) {
      return { type: 'idle_thought' };
    }

    return null;
  }

  async function processStimulus(stimulus) {
    const systemPrompt = promptBuilder.buildSystemPrompt();
    const bot = { position: memoryManager.working.getContext('position') };

    switch (stimulus.type) {
      case 'chat': {
        const userPrompt = promptBuilder.buildChatResponsePrompt(
          stimulus.username,
          stimulus.message,
          stimulus.context,
        );

        conversationHistory = [...conversationHistory, { role: 'user', content: userPrompt }];
        if (conversationHistory.length > MAX_HISTORY) {
          conversationHistory = conversationHistory.slice(-MAX_HISTORY);
        }

        const response = await llm.ask(conversationHistory, { systemPrompt });

        conversationHistory = [...conversationHistory, { role: 'assistant', content: response.content }];

        return { type: 'chat_response', content: response.content, stimulus };
      }

      case 'task_decomposition': {
        const thinkPrompt = promptBuilder.buildThinkingPrompt({
          position: bot.position,
          health: memoryManager.working.recall('health') ?? 20,
          food: memoryManager.working.recall('food') ?? 20,
          isDay: memoryManager.working.recall('isDay') ?? true,
          prompt: `I need to figure out how to: "${stimulus.task.name}". Break this into concrete Minecraft actions.`,
        });

        const response = await llm.ask(
          [{ role: 'user', content: thinkPrompt }],
          { systemPrompt },
        );

        return { type: 'plan', content: response.content, stimulus };
      }

      case 'idle_thought': {
        const thinkPrompt = promptBuilder.buildThinkingPrompt({
          position: bot.position,
          health: memoryManager.working.recall('health') ?? 20,
          food: memoryManager.working.recall('food') ?? 20,
          isDay: memoryManager.working.recall('isDay') ?? true,
          prompt: 'I have no active task. What should I do next? Consider my motivations and current situation.',
        });

        const response = await llm.ask(
          [{ role: 'user', content: thinkPrompt }],
          { systemPrompt, maxResponseTokens: 512 },
        );

        return { type: 'autonomous_thought', content: response.content, stimulus };
      }

      default:
        return null;
    }
  }

  function handleResponse(response, stimulus) {
    const parsed = safeJsonParse(response.content);

    if (parsed) {
      // Structured response
      if (parsed.say) {
        bus.emit('chat:outgoing', { message: parsed.say }, EventCategory.CHAT);
      }

      if (parsed.actions && Array.isArray(parsed.actions)) {
        bus.emit('thinker:actions', { actions: parsed.actions }, EventCategory.AGENT);
      }

      if (parsed.thought) {
        log.info(`Thought: ${parsed.thought}`);
        memoryManager.working.store('lastThought', parsed.thought, 60000);
      }

      if (parsed.emotion) {
        bus.emit('soul:emotion', { emotion: parsed.emotion }, EventCategory.SOUL);
      }
    } else {
      // Unstructured response - treat as chat
      if (response.type === 'chat_response') {
        bus.emit('chat:outgoing', { message: response.content }, EventCategory.CHAT);
      } else {
        log.info(`Unstructured thought: ${response.content.slice(0, 100)}`);
      }
    }

    bus.emit('thinker:thought', {
      type: response.type,
      content: response.content,
      stimulus: stimulus.type,
    }, EventCategory.AGENT);
  }

  /**
   * Queue a question for the thinker (e.g., from chat)
   */
  function askQuestion(username, message, context = {}) {
    pendingQuestions.push({
      type: 'chat',
      username,
      message,
      context,
      queuedAt: Date.now(),
    });
    log.debug(`Question queued from ${username}: "${message}"`);
  }

  // ========== MISSION-LEVEL THINKING ==========

  /**
   * PASO 2: Single LLM call to interpret an instruction and generate a mission plan
   * Called by BehaviorManager.startFromInstruction()
   */
  async function planMission(context) {
    const systemPrompt = promptBuilder.buildSystemPrompt();
    const missionPrompt = promptBuilder.buildMissionPlanPrompt(context);

    log.info(`Planning mission: "${context.instruction}"`);

    const response = await llm.ask(
      [{ role: 'user', content: missionPrompt }],
      { systemPrompt, maxResponseTokens: 1024 },
    );

    const parsed = safeJsonParse(response.content);

    if (parsed) {
      log.info(`Mission plan generated: "${parsed.plan?.name ?? 'unnamed'}"`);
      return {
        interpretation: parsed.interpretation ?? context.instruction,
        name: parsed.plan?.name ?? 'Mission',
        duration: parsed.plan?.duration ?? 'unknown',
        subtasks: parsed.plan?.subtasks ?? [],
        response: parsed.response ?? null,
        raw: response.content,
      };
    }

    // Fallback: unstructured response
    return {
      interpretation: context.instruction,
      name: 'Mission',
      duration: 'unknown',
      subtasks: [context.instruction],
      response: response.content,
      raw: response.content,
    };
  }

  /**
   * PASO 6: Handle unexpected event during an active mission
   * Only called when the behavior handler can't resolve it locally
   */
  async function handleMissionEvent(context) {
    const systemPrompt = promptBuilder.buildSystemPrompt();
    const eventPrompt = promptBuilder.buildMissionEventPrompt(context);

    log.info(`Mission event: ${context.event.name}`);

    const response = await llm.ask(
      [{ role: 'user', content: eventPrompt }],
      { systemPrompt, maxResponseTokens: 512 },
    );

    const parsed = safeJsonParse(response.content);

    if (parsed) {
      return {
        actions: parsed.actions ?? [],
        say: parsed.say ?? parsed.response ?? null,
        decision: parsed.decision ?? parsed.thought ?? null,
      };
    }

    return { actions: [], say: response.content, decision: null };
  }

  function setCooldown(ms) {
    thinkCooldownMs = ms;
  }

  function getStatus() {
    return Object.freeze({
      isThinking,
      pendingQuestions: pendingQuestions.length,
      lastThinkTime,
      cooldownMs: thinkCooldownMs,
      historyLength: conversationHistory.length,
      llmStats: llm.getStats(),
    });
  }

  return Object.freeze({
    think,
    askQuestion,
    planMission,
    handleMissionEvent,
    setCooldown,
    getStatus,
  });
}

export default createThinker;
