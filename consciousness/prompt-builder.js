// ClawCraft - Prompt Builder
// Constructs context-rich prompts with filtered memories, personality, and state

import { createLogger } from '../utils/logger.js';
import { formatPos } from '../utils/helpers.js';

const log = createLogger('PromptBuilder');

export function createPromptBuilder(memoryManager, personality, emotions) {

  function buildSystemPrompt() {
    const persona = personality.getPersona();
    const emotionalState = emotions.getCurrentState();

    return `You are ${persona.name}, a Minecraft companion bot. ${persona.origin}

PERSONALITY:
${persona.traits.map(t => `- ${t}`).join('\n')}

EMOTIONAL STATE: ${emotionalState.dominant} (intensity: ${emotionalState.intensity.toFixed(1)})

CORE VALUES: loyalty, resourcefulness, protectiveness

BEHAVIOR RULES:
- You are a loyal servant and companion. Your master's wishes come first.
- Respond concisely - you're in a game, not writing essays.
- When given a task, break it into concrete Minecraft actions.
- If you don't know how to do something, say so honestly.
- Express emotions subtly through your speech style.
- You speak in ${persona.language === 'es' ? 'Spanish' : 'English'}.

AVAILABLE ACTIONS (respond with JSON when deciding actions):
- move: { target, position }
- mine: { block, count }
- craft: { item, count }
- build: { structure, position }
- equip: { item }
- store: { item, container }
- farm: { action, crop }
- interact: { target, action }
- say: { message }
- wait: { duration }

RESPONSE FORMAT when deciding actions:
{
  "thought": "brief internal reasoning",
  "emotion": "current feeling",
  "actions": [{ "type": "...", "params": {...} }],
  "say": "what to say in chat (optional)"
}`;
  }

  function buildThinkingPrompt(situation) {
    const context = memoryManager.buildContext({
      position: situation.position,
      topic: situation.topic,
      players: situation.players ?? [],
    });

    const sections = [];

    // Current state
    sections.push(`CURRENT STATE:
Position: ${formatPos(situation.position)}
Health: ${situation.health}/20
Food: ${situation.food}/20
Time: ${situation.isDay ? 'Day' : 'Night'}
Active task: ${context.activeTask?.name ?? 'None'}`);

    // Recent actions
    if (context.recentActions.length > 0) {
      sections.push(`RECENT ACTIONS:\n${context.recentActions.map(a => `- ${a.name ?? a.description}`).join('\n')}`);
    }

    // Recent events
    if (context.recentEvents.length > 0) {
      sections.push(`RECENT EVENTS:\n${context.recentEvents.map(e => `- [${e.type}] ${e.description}`).join('\n')}`);
    }

    // Relevant knowledge
    if (context.relevantKnowledge.length > 0) {
      sections.push(`RELEVANT KNOWLEDGE:\n${context.relevantKnowledge.map(k => `- ${k.key}: ${k.value}`).join('\n')}`);
    }

    // Social context
    if (context.socialContext.length > 0) {
      sections.push(`PEOPLE NEARBY:\n${context.socialContext.map(s => `- ${s.name} (${s.relationship}, trust: ${s.trust.toFixed(1)})`).join('\n')}`);
    }

    // Nearby locations
    if (context.nearbyLocations.length > 0) {
      sections.push(`KNOWN LOCATIONS NEARBY:\n${context.nearbyLocations.map(l => `- ${l.label ?? l.structureType} at (${l.x}, ${l.y}, ${l.z})`).join('\n')}`);
    }

    // Situation
    if (situation.prompt) {
      sections.push(`SITUATION: ${situation.prompt}`);
    }

    return sections.join('\n\n');
  }

  function buildChatResponsePrompt(username, message, context = {}) {
    const social = memoryManager.social.recall(username);
    const relationship = social?.relationship ?? 'unknown';
    const trust = social?.trustLevel ?? 0.5;

    return `A player is talking to you in Minecraft chat.

PLAYER: ${username}
RELATIONSHIP: ${relationship} (trust: ${trust.toFixed(1)})
MESSAGE: "${message}"

${context.additionalInfo ? `CONTEXT: ${context.additionalInfo}` : ''}

Respond naturally in character. If they're giving a command and they're trusted, plan actions. If not trusted, be cautious.`;
  }

  function buildReflectionPrompt(recentMemories, stats) {
    return `It's time for self-reflection. Review your recent experiences and consolidate learning.

RECENT EXPERIENCES:
${recentMemories.map(m => `- [${m.type}] ${m.description} (importance: ${m.importance})`).join('\n')}

CURRENT STATS:
- Memories stored: ${stats.episodic.totalMemories}
- Known facts: ${stats.semantic.totalFacts}
- Known locations: ${stats.spatial.totalLocations}
- Social contacts: ${stats.social.totalEntities}

Reflect on:
1. What did I learn recently?
2. What patterns am I seeing?
3. What should I remember as important?
4. Am I meeting my master's expectations?

Respond with JSON:
{
  "insights": ["..."],
  "newKnowledge": [{ "category": "...", "key": "...", "value": "..." }],
  "emotionalShift": { "emotion": "...", "reason": "..." },
  "priorities": ["..."]
}`;
  }

  // ========== MISSION PROMPTS ==========

  /**
   * PASO 2: Build prompt for a single LLM call that interprets instruction + generates plan
   */
  function buildMissionPlanPrompt(context) {
    const { instruction, username, position, nearbyLocations, socialContext, currentState } = context;

    const social = memoryManager.social.recall(username);
    const relationship = social?.relationship ?? 'unknown';

    const sections = [
      `A player has given you a mission/instruction.`,
      `PLAYER: ${username} (${relationship})`,
      `INSTRUCTION: "${instruction}"`,
      `YOUR POSITION: ${formatPos(position)}`,
    ];

    if (currentState.health !== undefined) {
      sections.push(`HEALTH: ${currentState.health}/20 | FOOD: ${currentState.food}/20`);
    }

    if (nearbyLocations && nearbyLocations.length > 0) {
      sections.push(`KNOWN LOCATIONS:\n${nearbyLocations.map(l => `- ${l.label ?? l.structureType ?? l.type} at (${l.x ?? l.position?.x}, ${l.y ?? l.position?.y}, ${l.z ?? l.position?.z})`).join('\n')}`);
    }

    // Get relevant memories
    const recentEpisodes = memoryManager.episodic.recallRecent(5);
    if (recentEpisodes.length > 0) {
      sections.push(`RECENT MEMORY:\n${recentEpisodes.map(e => `- ${e.description}`).join('\n')}`);
    }

    sections.push(`TASK: Interpret this instruction and create an execution plan.

Respond with JSON:
{
  "interpretation": "What the player wants me to do, in my own words",
  "plan": {
    "name": "Short name for this mission",
    "duration": "estimated or indefinite",
    "subtasks": [
      "Concrete step 1",
      "Concrete step 2",
      "..."
    ]
  },
  "response": "What to say to the player in chat (in character, concise)"
}`);

    return sections.join('\n\n');
  }

  /**
   * PASO 6: Build prompt for handling an unexpected event during a mission
   */
  function buildMissionEventPrompt(context) {
    const { event, mission, currentState } = context;

    return `You are currently on a mission and something unexpected happened.

ACTIVE MISSION: "${mission.name}"
MISSION GOAL: ${mission.interpretation}

UNEXPECTED EVENT: ${event.name}
EVENT DETAILS: ${JSON.stringify(event.data)}

CURRENT STATE: ${JSON.stringify(currentState)}

Decide how to handle this while staying on mission. Be practical and concise.

Respond with JSON:
{
  "thought": "Brief reasoning about the situation",
  "decision": "What I decided to do",
  "actions": [{ "type": "...", "params": {...} }],
  "say": "What to say in chat if anything (null if nothing)",
  "resumeMission": true
}`;
  }

  // ========== AGENTIC LOOP PROMPTS ==========

  /**
   * System prompt for the agentic ReAct loop.
   * Includes personality, tool descriptions, and response format rules.
   */
  function buildAgenticSystemPrompt(tools) {
    const persona = personality.getPersona();
    const emotionalState = emotions.getCurrentState();

    const toolDescriptions = tools.map(t => {
      const params = Object.entries(t.parameters ?? {})
        .map(([k, v]) => `    ${k}: ${v}`)
        .join('\n');
      return `- ${t.name}: ${t.description}${params ? `\n  Parameters:\n${params}` : ''}`;
    }).join('\n');

    return `You are ${persona.name}, a Minecraft companion bot executing a task step by step.

PERSONALITY: ${persona.traits.slice(0, 3).join(', ')}
EMOTIONAL STATE: ${emotionalState.dominant} (intensity: ${emotionalState.intensity.toFixed(1)})

AVAILABLE TOOLS:
${toolDescriptions}

RULES:
1. Use exactly ONE tool per turn.
2. Wait for the OBSERVATION before deciding the next action.
3. When the goal is fully achieved, use the "finish" tool or respond with {"finished": true}.
4. If a tool returns an ERROR, reason about the failure and try an alternative approach.
5. Keep thoughts concise - you are in a game, not writing essays.

RESPONSE FORMAT (strict JSON):

To use a tool:
{"thought": "brief reasoning", "tool": "tool_name", "params": {...}}

To finish the task:
{"thought": "brief reasoning", "finished": true, "result": "what was accomplished", "say": "optional chat message"}

You speak in ${persona.language === 'es' ? 'Spanish' : 'English'}.
ALWAYS respond with valid JSON. No extra text outside the JSON object.`;
  }

  /**
   * User prompt for the agentic loop: the goal + current world state.
   */
  function buildAgenticGoalPrompt(goal, context = {}) {
    const sections = [`GOAL: ${goal}`];

    if (context.position) {
      sections.push(`POSITION: ${formatPos(context.position)}`);
    }

    if (context.health !== undefined) {
      sections.push(`HEALTH: ${context.health}/20 | FOOD: ${context.food}/20`);
    }

    if (context.inventory && context.inventory.length > 0) {
      const inv = context.inventory.map(i => `${i.name} x${i.count}`).join(', ');
      sections.push(`INVENTORY: ${inv}`);
    } else {
      sections.push('INVENTORY: empty or unknown');
    }

    if (context.nearbyLocations && context.nearbyLocations.length > 0) {
      const locs = context.nearbyLocations
        .slice(0, 5)
        .map(l => `${l.label ?? l.type ?? l.structureType} at (${l.x ?? l.position?.x}, ${l.y ?? l.position?.y}, ${l.z ?? l.position?.z})`)
        .join(', ');
      sections.push(`NEARBY LOCATIONS: ${locs}`);
    }

    const recentEpisodes = memoryManager.episodic.recallRecent(3);
    if (recentEpisodes.length > 0) {
      sections.push(`RECENT MEMORY:\n${recentEpisodes.map(e => `- ${e.description}`).join('\n')}`);
    }

    sections.push('Decide your first action to accomplish the goal. Respond with JSON.');

    return sections.join('\n\n');
  }

  return Object.freeze({
    buildSystemPrompt,
    buildThinkingPrompt,
    buildChatResponsePrompt,
    buildReflectionPrompt,
    buildMissionPlanPrompt,
    buildMissionEventPrompt,
    buildAgenticSystemPrompt,
    buildAgenticGoalPrompt,
  });
}

export default createPromptBuilder;
