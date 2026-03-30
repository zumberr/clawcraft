// ClawCraft - Mood State Machine
// Derives a high-level disposition from schedule, emotions, motivations, and behavior
// Transitions smoothly via damped interpolation, never instant flips

import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Soul:Mood');

export const MOODS = Object.freeze({
  BUSY: 'busy',
  ATTENTIVE: 'attentive',
  RELAXED: 'relaxed',
  PROTECTIVE: 'protective',
  CURIOUS: 'curious',
});

const TRANSITION_SPEED = 0.15;

export function createMood(bus, emotions, schedule, motivations, behaviorManager) {
  let currentMood = MOODS.RELAXED;
  let moodWeights = {
    [MOODS.BUSY]: 0,
    [MOODS.ATTENTIVE]: 0,
    [MOODS.RELAXED]: 0.5,
    [MOODS.PROTECTIVE]: 0,
    [MOODS.CURIOUS]: 0,
  };

  function computeTargetWeights() {
    const emotionState = emotions.getCurrentState();
    const scheduleStatus = schedule.getStatus();
    const drives = motivations.getDrives();
    const behaviorStatus = behaviorManager.getStatus();
    const activity = scheduleStatus.currentActivity?.activity ?? null;

    const hasActiveBehavior = behaviorStatus.active !== null;

    return {
      [MOODS.BUSY]: clamp(
        (hasActiveBehavior ? 0.7 : 0) +
        (activity === 'work' || activity === 'farm' || activity === 'prepare' ? 0.5 : 0),
        0, 1,
      ),

      [MOODS.ATTENTIVE]: clamp(
        (scheduleStatus.masterPresent ? 0.8 : 0) +
        (emotionState.determination > 0.6 ? 0.4 : 0),
        0, 1,
      ),

      [MOODS.RELAXED]: clamp(
        (activity === 'rest' ? 0.7 : 0) +
        (emotionState.joy > 0.6 && emotionState.fear < 0.2 ? 0.5 : 0) +
        (!hasActiveBehavior && activity !== 'guard' ? 0.2 : 0),
        0, 1,
      ),

      [MOODS.PROTECTIVE]: clamp(
        (activity === 'guard' ? 0.7 : 0) +
        (emotionState.fear > 0.3 ? 0.4 : 0) +
        (drives.security > 0.6 ? 0.3 : 0),
        0, 1,
      ),

      [MOODS.CURIOUS]: clamp(
        (drives.exploration > 0.5 ? 0.5 : 0) +
        (emotionState.curiosity > 0.6 ? 0.4 : 0) +
        (activity === 'explore' ? 0.6 : 0),
        0, 1,
      ),
    };
  }

  function update() {
    const targets = computeTargetWeights();

    const newWeights = {};
    for (const mood of Object.values(MOODS)) {
      const current = moodWeights[mood] ?? 0;
      const target = targets[mood] ?? 0;
      newWeights[mood] = current + (target - current) * TRANSITION_SPEED;
    }
    moodWeights = newWeights;

    // Find dominant mood
    let dominant = currentMood;
    let maxWeight = 0;

    for (const [mood, weight] of Object.entries(moodWeights)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        dominant = mood;
      }
    }

    if (dominant !== currentMood) {
      const oldMood = currentMood;
      currentMood = dominant;

      log.info(`Mood transition: ${oldMood} -> ${currentMood}`);

      bus.emit('mood:changed', {
        oldMood,
        newMood: currentMood,
        weights: { ...moodWeights },
      }, EventCategory.SOUL);
    }
  }

  function getCurrentMood() {
    return currentMood;
  }

  function getMoodWeights() {
    return Object.freeze({ ...moodWeights });
  }

  function getStatus() {
    return Object.freeze({
      currentMood,
      weights: { ...moodWeights },
    });
  }

  return Object.freeze({
    update,
    getCurrentMood,
    getMoodWeights,
    getStatus,
  });
}

export default createMood;
