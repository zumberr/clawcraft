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

  return Object.freeze({
    buildSystemPrompt,
    buildThinkingPrompt,
    buildChatResponsePrompt,
    buildReflectionPrompt,
    buildMissionPlanPrompt,
    buildMissionEventPrompt,
  });
}

export default createPromptBuilder;
