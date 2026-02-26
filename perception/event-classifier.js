// ClawCraft - Event Classifier
// Classifies incoming events by urgency and type for prioritization

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('EventClassifier');

export const Urgency = Object.freeze({
  CRITICAL: 'critical',   // Must react NOW (low health, creeper)
  HIGH: 'high',           // React soon (hostile nearby, hunger)
  MEDIUM: 'medium',       // Can wait (player chat, new POI)
  LOW: 'low',             // Background (time change, block update)
});

const CLASSIFICATION_RULES = [
  // Critical
  { pattern: 'health:damage', urgency: Urgency.CRITICAL, condition: (e) => e.data.health < 6 },
  { pattern: 'entity:hostileNearby', urgency: Urgency.CRITICAL, condition: (e) => e.data.distance < 5 },
  { pattern: 'agent:death', urgency: Urgency.CRITICAL },

  // High
  { pattern: 'health:damage', urgency: Urgency.HIGH },
  { pattern: 'entity:hostileNearby', urgency: Urgency.HIGH },
  { pattern: 'health:hunger', urgency: Urgency.HIGH, condition: (e) => e.data.food < 6 },
  { pattern: 'command:received', urgency: Urgency.HIGH },
  { pattern: 'entity:playerAppeared', urgency: Urgency.HIGH },

  // Medium
  { pattern: 'health:hunger', urgency: Urgency.MEDIUM },
  { pattern: 'chat:incoming', urgency: Urgency.MEDIUM },
  { pattern: 'world:poiDiscovered', urgency: Urgency.MEDIUM },
  { pattern: 'task:', urgency: Urgency.MEDIUM },

  // Low
  { pattern: 'world:timeChange', urgency: Urgency.LOW },
  { pattern: 'agent:moved', urgency: Urgency.LOW },
  { pattern: 'health:heal', urgency: Urgency.LOW },
];

export function createEventClassifier(bus) {
  let recentClassified = [];
  const MAX_RECENT = 100;

  function classify(event) {
    for (const rule of CLASSIFICATION_RULES) {
      if (!event.name.startsWith(rule.pattern)) continue;
      if (rule.condition && !rule.condition(event)) continue;

      return {
        ...event,
        urgency: rule.urgency,
        classifiedAt: Date.now(),
      };
    }

    // Default: low urgency
    return {
      ...event,
      urgency: Urgency.LOW,
      classifiedAt: Date.now(),
    };
  }

  // Listen to all categories and classify
  for (const category of Object.values(EventCategory)) {
    bus.onCategory(category, (event) => {
      const classified = classify(event);
      recentClassified.push(classified);

      if (recentClassified.length > MAX_RECENT) {
        recentClassified = recentClassified.slice(-MAX_RECENT);
      }

      // Re-emit classified events for instinct/planning layers
      if (classified.urgency === Urgency.CRITICAL) {
        bus.emit('classified:critical', classified);
      } else if (classified.urgency === Urgency.HIGH) {
        bus.emit('classified:high', classified);
      }
    });
  }

  function getRecentByUrgency(urgency, limit = 10) {
    return recentClassified
      .filter(e => e.urgency === urgency)
      .slice(-limit);
  }

  function getRecent(limit = 20) {
    return recentClassified.slice(-limit);
  }

  function getSummary() {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const event of recentClassified) {
      counts[event.urgency] = (counts[event.urgency] || 0) + 1;
    }
    return Object.freeze(counts);
  }

  return Object.freeze({
    classify,
    getRecentByUrgency,
    getRecent,
    getSummary,
  });
}

export default createEventClassifier;
