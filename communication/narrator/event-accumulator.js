// ClawCraft - Event Accumulator
// Collects events over a time window and batches them for narration
// Instead of reporting every single event, accumulates and summarizes
// Example: "Killed 3 zombies" instead of 3 separate kill messages

import { createLogger } from '../../utils/logger.js';

const log = createLogger('Narrator:Accumulator');

const DEFAULT_WINDOW_MS = 30000; // 30 second accumulation window

export function createEventAccumulator(bus) {
  let buffer = []; // { type, data, timestamp }
  let windowMs = DEFAULT_WINDOW_MS;
  let flushTimer = null;
  let flushCallback = null;

  function configure(options = {}) {
    if (options.windowMs) windowMs = options.windowMs;
    if (options.onFlush) flushCallback = options.onFlush;
  }

  function push(type, data = {}) {
    buffer.push({
      type,
      data,
      timestamp: Date.now(),
    });

    // Start flush timer on first event
    if (!flushTimer) {
      flushTimer = setTimeout(flush, windowMs);
    }
  }

  function flush() {
    if (buffer.length === 0) {
      clearTimer();
      return null;
    }

    const events = [...buffer];
    buffer = [];
    clearTimer();

    const summary = summarize(events);

    if (flushCallback) {
      flushCallback(summary);
    }

    return summary;
  }

  function summarize(events) {
    // Group events by type
    const groups = new Map();
    for (const event of events) {
      const existing = groups.get(event.type) ?? [];
      groups.set(event.type, [...existing, event]);
    }

    const summaries = [];
    for (const [type, groupEvents] of groups) {
      summaries.push({
        type,
        count: groupEvents.length,
        events: groupEvents,
        firstAt: groupEvents[0].timestamp,
        lastAt: groupEvents[groupEvents.length - 1].timestamp,
        data: mergeEventData(groupEvents),
      });
    }

    // Sort by count (most frequent first)
    summaries.sort((a, b) => b.count - a.count);

    return Object.freeze({
      summaries,
      totalEvents: events.length,
      windowStart: events[0]?.timestamp ?? Date.now(),
      windowEnd: events[events.length - 1]?.timestamp ?? Date.now(),
    });
  }

  function mergeEventData(events) {
    // Merge data fields, collecting unique values
    const merged = {};
    for (const event of events) {
      for (const [key, value] of Object.entries(event.data)) {
        if (merged[key] === undefined) {
          merged[key] = [value];
        } else if (!merged[key].includes(value)) {
          merged[key] = [...merged[key], value];
        }
      }
    }
    return merged;
  }

  function clearTimer() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function getBufferSize() {
    return buffer.length;
  }

  function clear() {
    buffer = [];
    clearTimer();
  }

  // Wire common events to accumulator
  function wireEvents() {
    bus.on('combat:ended', (event) => {
      if (event.data.reason === 'target_gone') {
        push('hostile_killed', { name: event.data.target ?? 'hostile' });
      }
    });

    bus.on('action:mined', (event) => {
      push('block_mined', { block: event.data.blockName });
    });

    bus.on('action:crafted', (event) => {
      push('item_crafted', { item: event.data.itemName });
    });

    bus.on('action:placed', (event) => {
      push('block_placed', { block: event.data.blockName });
    });

    bus.on('action:harvested', (event) => {
      push('crop_harvested', { crop: event.data.cropName });
    });

    bus.on('health:damage', (event) => {
      push('damage_taken', { amount: event.data.amount, source: event.data.source });
    });

    bus.on('entity:playerAppeared', (event) => {
      push('player_seen', { name: event.data.name });
    });

    bus.on('spatial:discovered', (event) => {
      push('location_found', { label: event.data.label });
    });
  }

  wireEvents();

  return Object.freeze({
    configure,
    push,
    flush,
    getBufferSize,
    clear,
  });
}

export default createEventAccumulator;
