// ClawCraft - Agentic Loop (ReAct Pattern)
// Executes a goal by iteratively calling the LLM to reason about the
// current state, pick a tool, execute it, and observe the result.
// Only used for the 'generic' behavior type (no specialized handler).

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('AgenticLoop');

const DEFAULT_MAX_STEPS = parseInt(process.env.AGENTIC_MAX_STEPS ?? '10', 10);
const DEFAULT_STEP_DELAY = parseInt(process.env.AGENTIC_STEP_DELAY ?? '1000', 10);
const DEFAULT_TIMEOUT = parseInt(process.env.AGENTIC_TIMEOUT ?? '120000', 10);

export function createAgenticLoop(llm, promptBuilder, toolRegistry, bus, memoryManager) {
  let interrupted = false;

  // Listen for interrupt signals from instincts and behavior lifecycle
  bus.on('instinct:flee', () => { interrupted = true; });
  bus.on('classified:critical', () => { interrupted = true; });
  bus.on('behavior:stopped', () => { interrupted = true; });

  /**
   * Run the agentic loop for a given goal.
   * @param {string} goal - Natural language description of the task
   * @param {object} context - Current world state (position, health, inventory, etc.)
   * @param {object} options - { maxSteps, maxTokensPerStep, stepDelay, timeout }
   * @returns {{ success: boolean, reason?: string, result?: string, trace: Array, steps: number }}
   */
  async function run(goal, context, options = {}) {
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxTokensPerStep = options.maxTokensPerStep ?? 512;
    const stepDelay = options.stepDelay ?? DEFAULT_STEP_DELAY;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    interrupted = false;
    const startTime = Date.now();

    const systemPrompt = promptBuilder.buildAgenticSystemPrompt(toolRegistry.getTools());
    const messages = [
      { role: 'user', content: promptBuilder.buildAgenticGoalPrompt(goal, context) },
    ];

    const trace = [];

    log.info(`Agentic loop started: "${goal}" (max ${maxSteps} steps)`);
    bus.emit('agentic:started', { goal, maxSteps }, EventCategory.AGENT);

    for (let step = 0; step < maxSteps; step++) {
      // Check interruption
      if (interrupted) {
        log.info(`Agentic loop interrupted at step ${step}`);
        return { success: false, reason: 'interrupted', trace, steps: step };
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        log.warn(`Agentic loop timed out after ${timeout}ms`);
        return { success: false, reason: 'timeout', trace, steps: step };
      }

      // REASON + ACT: Ask LLM to decide next action
      let response;
      try {
        response = await llm.ask(messages, {
          systemPrompt,
          maxResponseTokens: maxTokensPerStep,
          jsonMode: true,
        });
      } catch (err) {
        log.error(`LLM call failed at step ${step}: ${err.message}`);
        return { success: false, reason: 'llm_error', trace, steps: step };
      }

      // Parse the LLM response
      let parsed = parseToolCall(response.content);

      // If parsing failed, retry once with a corrective instruction
      if (!parsed.valid) {
        log.warn(`Invalid JSON from LLM at step ${step}, retrying...`);
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: 'Your response was not valid JSON. You MUST respond with a JSON object like: {"thought": "...", "tool": "tool_name", "params": {...}} or {"thought": "...", "finished": true, "result": "..."}',
        });

        try {
          response = await llm.ask(messages, {
            systemPrompt,
            maxResponseTokens: maxTokensPerStep,
            jsonMode: true,
          });
          parsed = parseToolCall(response.content);
        } catch (err) {
          log.error(`LLM retry failed at step ${step}: ${err.message}`);
          return { success: false, reason: 'llm_error', trace, steps: step };
        }

        if (!parsed.valid) {
          log.error(`LLM still invalid after retry at step ${step}`);
          return { success: false, reason: 'invalid_json', trace, steps: step };
        }
      }

      // Check if LLM says task is finished
      if (parsed.finished) {
        if (parsed.say) {
          bus.emit('chat:outgoing', { message: parsed.say }, EventCategory.CHAT);
        }
        log.info(`Agentic loop completed in ${step + 1} steps: ${parsed.result}`);
        bus.emit('agentic:completed', { goal, steps: step + 1, result: parsed.result }, EventCategory.AGENT);
        return { success: true, result: parsed.result, trace, steps: step + 1 };
      }

      // Check if LLM didn't pick any tool
      if (!parsed.toolName) {
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: 'You must use a tool. Choose a concrete action from the available tools.' });
        continue;
      }

      // EXECUTE: Run the tool with error handling
      const toolResult = await toolRegistry.execute(parsed.toolName, parsed.params);

      // OBSERVE: Format result and add to conversation
      const observation = toolRegistry.formatObservation(parsed.toolName, toolResult);

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: `OBSERVATION:\n${observation}` });

      trace.push({
        step,
        tool: parsed.toolName,
        params: parsed.params,
        observation,
        thought: parsed.thought,
      });

      log.debug(`Step ${step}: ${parsed.toolName} -> ${observation.slice(0, 100)}`);
      bus.emit('agentic:step', { step, tool: parsed.toolName, observation }, EventCategory.AGENT);

      // COOLDOWN between steps
      if (step < maxSteps - 1 && stepDelay > 0) {
        await new Promise(r => setTimeout(r, stepDelay));
      }
    }

    log.warn(`Agentic loop hit max steps (${maxSteps})`);
    bus.emit('agentic:maxSteps', { goal, steps: maxSteps, trace }, EventCategory.AGENT);
    return { success: false, reason: 'max_steps', trace, steps: maxSteps };
  }

  function interrupt(reason = 'external') {
    interrupted = true;
    log.info(`Agentic loop interrupt requested: ${reason}`);
  }

  return Object.freeze({ run, interrupt });
}

/**
 * Parse the LLM JSON response into a structured tool call or finish signal.
 */
function parseToolCall(content) {
  try {
    // Strip markdown code fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const obj = JSON.parse(cleaned);

    if (obj.finished) {
      return {
        valid: true,
        finished: true,
        result: obj.result ?? 'Task completed',
        say: obj.say ?? null,
        thought: obj.thought ?? '',
      };
    }

    if (obj.tool) {
      return {
        valid: true,
        finished: false,
        toolName: obj.tool,
        params: obj.params ?? {},
        thought: obj.thought ?? '',
      };
    }

    // JSON is valid but doesn't have tool or finished
    return { valid: true, finished: false, toolName: null, params: {}, thought: obj.thought ?? '' };
  } catch {
    return { valid: false, finished: false, toolName: null, params: {} };
  }
}

export default createAgenticLoop;
