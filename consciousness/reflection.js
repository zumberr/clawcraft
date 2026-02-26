// ClawCraft - Reflection
// Periodic self-reflection: consolidate memories, update personality, find patterns

import { createLogger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/helpers.js';

const log = createLogger('Reflection');

export function createReflection(llm, memoryManager, personality, emotions) {
  let lastReflectionTime = 0;
  let reflectionCount = 0;
  let insights = [];

  /**
   * Perform a reflection cycle
   */
  async function reflect() {
    const now = Date.now();
    lastReflectionTime = now;
    reflectionCount++;

    log.info(`Reflection #${reflectionCount} starting...`);

    try {
      // Gather recent experiences
      const recentMemories = memoryManager.episodic.recallRecent(15);
      const stats = memoryManager.getFullStats();

      // Build reflection prompt
      const { createPromptBuilder } = await import('./prompt-builder.js');
      const promptBuilder = createPromptBuilder(memoryManager, personality, emotions);
      const reflectionPrompt = promptBuilder.buildReflectionPrompt(recentMemories, stats);
      const systemPrompt = promptBuilder.buildSystemPrompt();

      // Ask LLM to reflect
      const response = await llm.ask(
        [{ role: 'user', content: reflectionPrompt }],
        { systemPrompt, maxResponseTokens: 1024, temp: 0.8 },
      );

      // Process reflection
      const parsed = safeJsonParse(response.content);
      if (parsed) {
        processReflection(parsed);
      }

      log.info(`Reflection #${reflectionCount} complete`);
    } catch (err) {
      log.error(`Reflection failed: ${err.message}`);
    }
  }

  function processReflection(reflection) {
    // Store insights
    if (reflection.insights) {
      for (const insight of reflection.insights) {
        insights = [...insights, { text: insight, timestamp: Date.now() }];
        log.info(`Insight: ${insight}`);
      }
      // Keep only recent insights
      if (insights.length > 50) {
        insights = insights.slice(-50);
      }
    }

    // Learn new knowledge
    if (reflection.newKnowledge) {
      for (const knowledge of reflection.newKnowledge) {
        memoryManager.semantic.learn(
          knowledge.category,
          knowledge.key,
          knowledge.value,
          0.6,
          'reflection',
        );
      }
    }

    // Update emotional state
    if (reflection.emotionalShift) {
      emotions.applyShift(
        reflection.emotionalShift.emotion,
        reflection.emotionalShift.reason,
      );
    }

    // Record the reflection itself as an episodic memory
    memoryManager.episodic.record({
      type: 'reflection',
      description: `Reflected and gained ${reflection.insights?.length ?? 0} insights`,
      importance: 0.6,
      metadata: { reflectionNumber: reflectionCount, insights: reflection.insights },
    });
  }

  function getInsights(limit = 10) {
    return insights.slice(-limit);
  }

  function getStatus() {
    return Object.freeze({
      reflectionCount,
      lastReflectionTime,
      insightsCount: insights.length,
      recentInsights: insights.slice(-3).map(i => i.text),
    });
  }

  return Object.freeze({
    reflect,
    getInsights,
    getStatus,
  });
}

export default createReflection;
