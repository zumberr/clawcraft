// ClawCraft - Welcome Back System
// Greets returning players with context-aware messages
// Knows how long they've been gone, what happened while away
// Adapts greeting based on favorability tier and relationship

import { createLogger } from '../../utils/logger.js';
import { EventCategory } from '../../core/event-bus.js';

const log = createLogger('Proactive:WelcomeBack');

export function createWelcomeBack(bus, socialMemory, favorability, narrator) {
  let lastSeenTimes = new Map(); // playerName -> timestamp
  let sessionEvents = new Map(); // playerName -> [] events while away

  function initialize() {
    wireEvents();
    log.info('Welcome-back system initialized');
  }

  function wireEvents() {
    bus.on('entity:playerAppeared', (event) => {
      const name = event.data.name;
      if (!name) return;
      onPlayerReturn(name);
    });

    bus.on('entity:playerLeft', (event) => {
      const name = event.data.name;
      if (!name) return;
      lastSeenTimes.set(name, Date.now());
      sessionEvents.set(name, []);
    });

    // Track events while players are away
    bus.on('narrator:narration', (event) => {
      for (const [name, events] of sessionEvents) {
        // Only accumulate for players who are away
        if (!lastSeenTimes.has(name)) continue;
        sessionEvents.set(name, [...events, {
          text: event.data.text,
          importance: event.data.importance,
          timestamp: Date.now(),
        }]);
      }
    });
  }

  function onPlayerReturn(playerName) {
    const lastSeen = lastSeenTimes.get(playerName);
    if (!lastSeen) {
      // First time seeing this player
      greetNewPlayer(playerName);
      return;
    }

    const awayMinutes = Math.round((Date.now() - lastSeen) / 60000);
    const tier = favorability?.getPlayerTier(playerName)?.label ?? 'cooperative';
    const events = sessionEvents.get(playerName) ?? [];

    const greeting = buildGreeting(playerName, awayMinutes, tier, events);

    bus.emit('chat:outgoing', { message: greeting }, EventCategory.CHAT);

    // Clear tracked events
    sessionEvents.set(playerName, []);
    lastSeenTimes.delete(playerName);

    log.info(`Welcomed back ${playerName} (away ${awayMinutes} min, tier: ${tier})`);
  }

  function greetNewPlayer(playerName) {
    const social = socialMemory.recall(playerName);

    if (social?.relationship === 'master') {
      bus.emit('chat:outgoing', {
        message: `Maestro ${playerName}, a sus ordenes.`,
      }, EventCategory.CHAT);
    } else if (social && social.trustLevel >= 0.5) {
      bus.emit('chat:outgoing', {
        message: `Hola ${playerName}. Bienvenido.`,
      }, EventCategory.CHAT);
    }
    // Don't greet unknown players proactively
  }

  function buildGreeting(playerName, awayMinutes, tier, events) {
    const parts = [];

    // Base greeting varies by tier
    switch (tier) {
      case 'loyal':
        parts.push(awayMinutes > 60
          ? `Maestro ${playerName}! Te extrañe.`
          : `Bienvenido de vuelta, ${playerName}.`);
        break;
      case 'friendly':
        parts.push(`Hola ${playerName}! Que bueno verte.`);
        break;
      case 'cooperative':
        parts.push(`Hola ${playerName}.`);
        break;
      case 'distant':
      default:
        parts.push(`${playerName}.`);
        break;
    }

    // Absence duration
    if (awayMinutes > 120) {
      parts.push(`Estuviste fuera ${Math.round(awayMinutes / 60)} horas.`);
    } else if (awayMinutes > 30) {
      parts.push(`Ausente ${awayMinutes} min.`);
    }

    // Summary of what happened (only for friendly+ tiers)
    if ((tier === 'loyal' || tier === 'friendly') && events.length > 0) {
      const importantEvents = events.filter(e => e.importance !== 'low');
      if (importantEvents.length > 0) {
        parts.push(`Mientras no estabas: ${importantEvents[0].text}`);
      } else if (events.length > 0) {
        parts.push('Todo tranquilo mientras no estabas.');
      }
    }

    return parts.join(' ');
  }

  return Object.freeze({
    initialize,
  });
}

export default createWelcomeBack;
