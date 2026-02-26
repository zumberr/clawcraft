// ClawCraft - Favorability System
// Inspired by Touhou Little Maid's FavorabilityManager
// Tracks relationship depth with each player through actions, not just trust
// Favorability affects behavior: <20 distant, 20-50 cooperative, 50-80 friendly, 80+ loyal

import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Soul:Favorability');

// Favorability change table
const FAV_CHANGES = Object.freeze({
  PLAYER_GAVE_FOOD: 3,
  PLAYER_GAVE_TOOLS: 5,
  PLAYER_SAVED_LIFE: 10,
  PLAYER_GREETED: 1,
  PLAYER_TALKED: 1,
  COMPLETED_TASK_TOGETHER: 5,
  PLAYER_IGNORED_HELP: -3,
  PLAYER_DESTROYED_BUILD: -8,
  PLAYER_HIT_ME: -10,
  PLAYER_LEFT_NO_BYE: -1,
  DAILY_ABSENCE_DECAY: -0.5,
});

const BEHAVIOR_TIERS = Object.freeze({
  DISTANT: { min: 0, max: 20, label: 'distant' },
  COOPERATIVE: { min: 20, max: 50, label: 'cooperative' },
  FRIENDLY: { min: 50, max: 80, label: 'friendly' },
  LOYAL: { min: 80, max: 100, label: 'loyal' },
});

export function createFavorability(bus, socialMemory) {
  let favorabilityCache = new Map(); // playerName -> { score, history[] }

  function initialize() {
    // Load from social memory on start
    const allPlayers = socialMemory.recallAll();
    for (const player of allPlayers) {
      const meta = player.metadata ?? {};
      favorabilityCache.set(player.name, {
        score: meta.favorability ?? trustToFavorability(player.trustLevel),
        history: meta.favorabilityHistory ?? [],
      });
    }
  }

  function adjust(playerName, change, reason) {
    const current = getScore(playerName);
    const newScore = clamp(current + change, 0, 100);

    const entry = {
      score: newScore,
      history: [
        ...(favorabilityCache.get(playerName)?.history ?? []).slice(-30),
        { change, reason, timestamp: Date.now(), newScore },
      ],
    };

    favorabilityCache.set(playerName, entry);

    // Sync to social memory
    socialMemory.remember(playerName, {
      trustLevel: favorabilityToTrust(newScore),
      metadata: {
        favorability: newScore,
        favorabilityHistory: entry.history,
      },
    });

    const direction = change > 0 ? '+' : '';
    log.info(`${playerName}: ${direction}${change} (${reason}) -> ${newScore.toFixed(1)}`);

    bus.emit('favorability:changed', {
      player: playerName,
      change,
      reason,
      newScore,
      tier: getTier(newScore),
    }, EventCategory.SOUL);
  }

  function getScore(playerName) {
    return favorabilityCache.get(playerName)?.score ?? 50;
  }

  function getTier(score) {
    if (score >= BEHAVIOR_TIERS.LOYAL.min) return BEHAVIOR_TIERS.LOYAL;
    if (score >= BEHAVIOR_TIERS.FRIENDLY.min) return BEHAVIOR_TIERS.FRIENDLY;
    if (score >= BEHAVIOR_TIERS.COOPERATIVE.min) return BEHAVIOR_TIERS.COOPERATIVE;
    return BEHAVIOR_TIERS.DISTANT;
  }

  function getPlayerTier(playerName) {
    return getTier(getScore(playerName));
  }

  function getHistory(playerName, limit = 10) {
    return (favorabilityCache.get(playerName)?.history ?? []).slice(-limit);
  }

  function shouldSacrifice(playerName) {
    return getScore(playerName) >= 80;
  }

  function shouldInitiateConversation(playerName) {
    return getScore(playerName) >= 50;
  }

  function shouldObeyCommand(playerName) {
    return getScore(playerName) >= 20;
  }

  // Apply daily absence decay
  function applyAbsenceDecay() {
    for (const [name, data] of favorabilityCache) {
      if (data.score > 20) { // Don't decay below 20
        adjust(name, FAV_CHANGES.DAILY_ABSENCE_DECAY, 'absence_decay');
      }
    }
  }

  // Wire events
  function wireEvents() {
    bus.on('entity:playerAppeared', (event) => {
      const name = event.data.name;
      if (name) adjust(name, FAV_CHANGES.PLAYER_GREETED, 'player_appeared');
    });

    bus.on('command:received', (event) => {
      const name = event.data.username;
      if (name) adjust(name, FAV_CHANGES.PLAYER_TALKED, 'player_interacted');
    });

    bus.on('task:completed', (event) => {
      const requester = event.data?.task?.requester;
      if (requester) adjust(requester, FAV_CHANGES.COMPLETED_TASK_TOGETHER, 'completed_task');
    });

    bus.on('health:damage', (event) => {
      // Check if a player hit us (simplified)
      if (event.data.attacker?.type === 'player') {
        adjust(event.data.attacker.name, FAV_CHANGES.PLAYER_HIT_ME, 'player_hit');
      }
    });
  }

  wireEvents();

  function trustToFavorability(trust) {
    return trust * 100;
  }

  function favorabilityToTrust(fav) {
    return fav / 100;
  }

  function getStatus() {
    const players = [];
    for (const [name, data] of favorabilityCache) {
      players.push({
        name,
        score: Math.round(data.score * 10) / 10,
        tier: getTier(data.score).label,
      });
    }
    players.sort((a, b) => b.score - a.score);
    return Object.freeze({ players });
  }

  return Object.freeze({
    initialize,
    adjust,
    getScore,
    getTier,
    getPlayerTier,
    getHistory,
    shouldSacrifice,
    shouldInitiateConversation,
    shouldObeyCommand,
    applyAbsenceDecay,
    getStatus,
    FAV_CHANGES,
  });
}

export default createFavorability;
