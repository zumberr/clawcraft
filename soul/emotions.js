// ClawCraft - Emotions
// Dynamic emotional state that decays over time and is influenced by events

import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Soul:Emotions');

// Emotion dimensions (0-1 scale, 0.5 = neutral)
const BASE_STATE = Object.freeze({
  joy: 0.5,
  fear: 0.0,
  anger: 0.0,
  sadness: 0.0,
  curiosity: 0.5,
  pride: 0.3,
  loneliness: 0.2,
  determination: 0.5,
});

const DECAY_RATE = 0.02; // How fast emotions return to baseline per tick

export function createEmotions(bus) {
  let state = { ...BASE_STATE };
  let history = [];
  const MAX_HISTORY = 50;

  // Wire up automatic emotional responses to events
  function wireEvents() {
    bus.on('health:damage', () => {
      shift('fear', 0.2);
      shift('anger', 0.1);
    });

    bus.on('health:heal', () => {
      shift('joy', 0.1);
      shift('fear', -0.1);
    });

    bus.on('combat:ended', (event) => {
      if (event.data.reason === 'target_gone') {
        shift('pride', 0.15);
        shift('joy', 0.1);
      }
    });

    bus.on('combat:disengaged', () => {
      shift('fear', 0.15);
      shift('determination', -0.1);
    });

    bus.on('agent:death', () => {
      shift('sadness', 0.4);
      shift('fear', 0.2);
      shift('pride', -0.2);
      shift('joy', -0.3);
    });

    bus.on('task:completed', () => {
      shift('joy', 0.1);
      shift('pride', 0.1);
      shift('determination', 0.05);
    });

    bus.on('task:failed', () => {
      shift('sadness', 0.1);
      shift('determination', -0.05);
    });

    bus.on('entity:playerAppeared', (event) => {
      shift('joy', 0.05);
      shift('loneliness', -0.15);
      shift('curiosity', 0.1);
    });

    bus.on('command:received', () => {
      shift('determination', 0.1);
      shift('loneliness', -0.1);
    });

    bus.on('instinct:flee', () => {
      shift('fear', 0.3);
      shift('anger', 0.05);
    });

    bus.on('world:timeChange', (event) => {
      if (!event.data.isDay) {
        shift('fear', 0.05);
        shift('curiosity', -0.05);
      } else {
        shift('joy', 0.05);
        shift('curiosity', 0.05);
      }
    });
  }

  wireEvents();

  function shift(emotion, delta) {
    if (!(emotion in state)) return;

    const oldValue = state[emotion];
    state = { ...state, [emotion]: clamp(state[emotion] + delta, 0, 1) };

    if (Math.abs(delta) > 0.1) {
      log.debug(`${emotion}: ${oldValue.toFixed(2)} -> ${state[emotion].toFixed(2)}`);

      history = [...history, {
        emotion,
        delta,
        newValue: state[emotion],
        timestamp: Date.now(),
      }];

      if (history.length > MAX_HISTORY) {
        history = history.slice(-MAX_HISTORY);
      }
    }
  }

  function applyShift(emotion, reason) {
    const shiftMap = {
      happy: () => { shift('joy', 0.15); shift('sadness', -0.1); },
      sad: () => { shift('sadness', 0.15); shift('joy', -0.1); },
      scared: () => { shift('fear', 0.15); },
      angry: () => { shift('anger', 0.15); },
      curious: () => { shift('curiosity', 0.15); },
      proud: () => { shift('pride', 0.15); },
      lonely: () => { shift('loneliness', 0.15); },
      determined: () => { shift('determination', 0.15); },
      calm: () => { shift('fear', -0.1); shift('anger', -0.1); },
    };

    const fn = shiftMap[emotion];
    if (fn) {
      fn();
      log.info(`Emotional shift: ${emotion} (${reason})`);
    }
  }

  function decay() {
    const newState = {};
    for (const [emotion, value] of Object.entries(state)) {
      const baseline = BASE_STATE[emotion];
      const diff = value - baseline;
      newState[emotion] = Math.abs(diff) < 0.01
        ? baseline
        : value - diff * DECAY_RATE;
    }
    state = newState;
  }

  function getCurrentState() {
    // Find dominant emotion
    let dominant = 'neutral';
    let maxDelta = 0;

    for (const [emotion, value] of Object.entries(state)) {
      const delta = Math.abs(value - BASE_STATE[emotion]);
      if (delta > maxDelta) {
        maxDelta = delta;
        dominant = emotion;
      }
    }

    return Object.freeze({
      ...state,
      dominant: maxDelta > 0.1 ? dominant : 'neutral',
      intensity: maxDelta,
    });
  }

  function getHistory(limit = 10) {
    return history.slice(-limit);
  }

  return Object.freeze({
    shift,
    applyShift,
    decay,
    getCurrentState,
    getHistory,
  });
}

export default createEmotions;
