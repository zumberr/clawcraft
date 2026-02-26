// ClawCraft - Memory Manager
// Filters and assembles relevant memories for the LLM context window

import { createLogger } from '../utils/logger.js';

const log = createLogger('MemoryManager');

export function createMemoryManager(memories) {
  const { working, episodic, semantic, spatial, social } = memories;

  /**
   * Build a context package for the LLM with only relevant memories
   */
  function buildContext(query = {}) {
    const {
      position = null,
      topic = null,
      players = [],
      maxTokenEstimate = 1500,
    } = query;

    const context = {
      currentState: working.getContext(),
      activeTask: working.getActiveTask(),
      recentActions: working.getRecentActions(5),
      recentEvents: [],
      relevantKnowledge: [],
      nearbyLocations: [],
      socialContext: [],
    };

    // Recent episodic memories
    context.recentEvents = episodic.recallRecent(5).map(summarizeEpisode);

    // Topic-specific episodic memories
    if (topic) {
      const topicMemories = episodic.search(topic, 3);
      context.recentEvents = [
        ...context.recentEvents,
        ...topicMemories.map(summarizeEpisode),
      ];
    }

    // Relevant semantic knowledge
    if (topic) {
      context.relevantKnowledge = semantic.search(topic, 5);
    }

    // Spatial context
    if (position) {
      context.nearbyLocations = spatial.recallNear(position, 'overworld', 5);
    }

    // Social context for mentioned players
    for (const player of players) {
      const socialInfo = social.recall(player);
      if (socialInfo) {
        context.socialContext.push({
          name: socialInfo.name,
          relationship: socialInfo.relationship,
          trust: socialInfo.trustLevel,
          notes: socialInfo.notes,
        });
      }
    }

    // Always include master info
    const master = social.getMaster();
    if (master && !players.includes(master.name)) {
      context.socialContext.unshift({
        name: master.name,
        relationship: 'master',
        trust: master.trustLevel,
        notes: master.notes,
      });
    }

    return Object.freeze(context);
  }

  /**
   * Consolidate working memory into long-term storage
   */
  function consolidate() {
    const workingEntries = working.recallAll();
    const actions = working.getRecentActions(20);

    // Store significant actions as episodic memories
    for (const action of actions) {
      if (action.significance && action.significance > 0.6) {
        episodic.record({
          type: action.type ?? 'action',
          description: action.description ?? `Performed ${action.name}`,
          position: action.position,
          importance: action.significance,
          actors: action.actors ?? [],
        });
      }
    }

    log.debug('Memory consolidation complete');
  }

  /**
   * Build a brief summary for prompt injection
   */
  function buildBriefSummary() {
    const task = working.getActiveTask();
    const actions = working.getRecentActions(3);
    const master = social.getMaster();

    const lines = [];
    if (task) lines.push(`Current task: ${task.name}`);
    if (actions.length > 0) {
      lines.push(`Recent: ${actions.map(a => a.name ?? a.description).join(', ')}`);
    }
    if (master) lines.push(`Master: ${master.name}`);

    return lines.join('\n');
  }

  function getFullStats() {
    return Object.freeze({
      working: working.getSummary(),
      episodic: episodic.getStats(),
      semantic: semantic.getStats(),
      spatial: spatial.getStats(),
      social: social.getStats(),
    });
  }

  function summarizeEpisode(episode) {
    return {
      type: episode.type,
      description: episode.description,
      importance: episode.importance,
      timestamp: episode.timestamp,
    };
  }

  return Object.freeze({
    working,
    episodic,
    semantic,
    spatial,
    social,
    buildContext,
    consolidate,
    buildBriefSummary,
    getFullStats,
  });
}

export default createMemoryManager;
