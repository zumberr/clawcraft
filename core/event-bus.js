// ClawCraft - Event Bus
// Central nervous system: typed events flow between all layers

import { createLogger } from '../utils/logger.js';

const log = createLogger('EventBus');

/**
 * Priority levels for event handlers
 */
export const Priority = Object.freeze({
  CRITICAL: 0,   // Instinct layer (survival)
  HIGH: 1,       // Active task interruption
  NORMAL: 2,     // Standard processing
  LOW: 3,        // Background / logging
});

/**
 * Event categories for filtering
 */
export const EventCategory = Object.freeze({
  WORLD: 'world',           // Block changes, weather, time
  ENTITY: 'entity',         // Mobs, players, items
  COMBAT: 'combat',         // Damage, attacks, deaths
  CHAT: 'chat',             // Messages from players / server
  INVENTORY: 'inventory',   // Item changes
  HEALTH: 'health',         // Hunger, health, effects
  TASK: 'task',             // Task lifecycle events
  AGENT: 'agent',           // Internal agent events
  COMMAND: 'command',       // Player commands
  MEMORY: 'memory',         // Memory updates
  SOUL: 'soul',             // Emotional / personality changes
});

export function createEventBus() {
  const listeners = new Map();  // eventName -> sorted array of { handler, priority, once }
  const categoryListeners = new Map(); // category -> array of handlers
  let eventHistory = [];
  const MAX_HISTORY = 200;

  function on(eventName, handler, priority = Priority.NORMAL) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, []);
    }
    const list = listeners.get(eventName);
    list.push({ handler, priority, once: false });
    list.sort((a, b) => a.priority - b.priority);
    return () => off(eventName, handler);
  }

  function once(eventName, handler, priority = Priority.NORMAL) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, []);
    }
    const list = listeners.get(eventName);
    list.push({ handler, priority, once: true });
    list.sort((a, b) => a.priority - b.priority);
  }

  function onCategory(category, handler) {
    if (!categoryListeners.has(category)) {
      categoryListeners.set(category, []);
    }
    categoryListeners.get(category).push(handler);
    return () => {
      const arr = categoryListeners.get(category);
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  function off(eventName, handler) {
    const list = listeners.get(eventName);
    if (!list) return;
    const idx = list.findIndex(l => l.handler === handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  function emit(eventName, data = {}, category = null) {
    const event = Object.freeze({
      name: eventName,
      category,
      data,
      timestamp: Date.now(),
    });

    // Record in history
    eventHistory.push(event);
    if (eventHistory.length > MAX_HISTORY) {
      eventHistory = eventHistory.slice(-MAX_HISTORY);
    }

    log.debug(`Event: ${eventName}`, category ? { category } : undefined);

    // Fire specific listeners
    const list = listeners.get(eventName);
    if (list) {
      const toRemove = [];
      for (const entry of list) {
        try {
          entry.handler(event);
        } catch (err) {
          log.error(`Handler error for ${eventName}: ${err.message}`);
        }
        if (entry.once) toRemove.push(entry);
      }
      for (const entry of toRemove) {
        const idx = list.indexOf(entry);
        if (idx !== -1) list.splice(idx, 1);
      }
    }

    // Fire category listeners
    if (category && categoryListeners.has(category)) {
      for (const handler of categoryListeners.get(category)) {
        try {
          handler(event);
        } catch (err) {
          log.error(`Category handler error for ${category}: ${err.message}`);
        }
      }
    }
  }

  function getHistory(filter = null, limit = 50) {
    let results = eventHistory;
    if (filter) {
      results = results.filter(e =>
        (filter.name ? e.name === filter.name : true) &&
        (filter.category ? e.category === filter.category : true)
      );
    }
    return results.slice(-limit);
  }

  function clear() {
    listeners.clear();
    categoryListeners.clear();
    eventHistory = [];
  }

  return Object.freeze({
    on,
    once,
    onCategory,
    off,
    emit,
    getHistory,
    clear,
  });
}

export default createEventBus;
