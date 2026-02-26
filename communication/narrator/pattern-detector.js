// ClawCraft - Pattern Detector
// Detects recurring patterns in accumulated events
// Identifies: streaks, repetitions, milestones, anomalies
// Feeds patterns to template narrator for richer storytelling

import { createLogger } from '../../utils/logger.js';

const log = createLogger('Narrator:PatternDetector');

const PatternType = Object.freeze({
  STREAK: 'streak',         // Same action repeated N times
  MILESTONE: 'milestone',   // Reaching a round number or achievement
  ANOMALY: 'anomaly',       // Unusual event (first time, rare)
  ESCALATION: 'escalation', // Increasing intensity over time
  CONTRAST: 'contrast',     // Sudden change from one state to another
});

// Milestone thresholds
const MILESTONES = Object.freeze({
  hostile_killed: [5, 10, 25, 50, 100],
  block_mined: [50, 100, 500, 1000],
  block_placed: [50, 100, 500],
  crop_harvested: [20, 50, 100],
  item_crafted: [10, 25, 50],
  damage_taken: [10, 25, 50],
});

export function createPatternDetector() {
  let history = []; // recent accumulated summaries
  let cumulativeCounts = new Map(); // type -> total count ever
  let reachedMilestones = new Set(); // "type:threshold" strings
  const MAX_HISTORY = 50;

  /**
   * Analyze an accumulated summary for patterns
   * Returns array of detected patterns
   */
  function detect(accumulatedSummary) {
    const patterns = [];

    // Store in history
    history = [...history.slice(-(MAX_HISTORY - 1)), accumulatedSummary];

    for (const summary of accumulatedSummary.summaries) {
      // Update cumulative counts
      const prevCount = cumulativeCounts.get(summary.type) ?? 0;
      const newCount = prevCount + summary.count;
      cumulativeCounts.set(summary.type, newCount);

      // Check for streaks (3+ of same type in one window)
      if (summary.count >= 3) {
        patterns.push({
          type: PatternType.STREAK,
          event: summary.type,
          count: summary.count,
          description: `${summary.count}x ${summary.type} in quick succession`,
        });
      }

      // Check milestones
      const thresholds = MILESTONES[summary.type];
      if (thresholds) {
        for (const threshold of thresholds) {
          const key = `${summary.type}:${threshold}`;
          if (newCount >= threshold && prevCount < threshold && !reachedMilestones.has(key)) {
            reachedMilestones.add(key);
            patterns.push({
              type: PatternType.MILESTONE,
              event: summary.type,
              threshold,
              totalCount: newCount,
              description: `Milestone: ${threshold} ${summary.type}`,
            });
          }
        }
      }

      // Check for anomalies (first occurrence)
      if (prevCount === 0) {
        patterns.push({
          type: PatternType.ANOMALY,
          event: summary.type,
          description: `First time: ${summary.type}`,
        });
      }
    }

    // Check for escalation patterns across windows
    const escalation = detectEscalation();
    if (escalation) patterns.push(escalation);

    // Check for contrast patterns
    const contrast = detectContrast();
    if (contrast) patterns.push(contrast);

    if (patterns.length > 0) {
      log.debug(`Detected ${patterns.length} patterns`);
    }

    return patterns;
  }

  function detectEscalation() {
    if (history.length < 3) return null;

    const recent = history.slice(-3);
    // Check if damage_taken is increasing
    const damageCounts = recent.map(h => {
      const dmg = h.summaries.find(s => s.type === 'damage_taken');
      return dmg?.count ?? 0;
    });

    if (damageCounts[0] < damageCounts[1] && damageCounts[1] < damageCounts[2] && damageCounts[2] > 0) {
      return {
        type: PatternType.ESCALATION,
        event: 'damage_taken',
        trend: damageCounts,
        description: 'Taking increasing damage - situation escalating',
      };
    }

    return null;
  }

  function detectContrast() {
    if (history.length < 2) return null;

    const prev = history[history.length - 2];
    const current = history[history.length - 1];

    const prevTypes = new Set(prev.summaries.map(s => s.type));
    const currentTypes = new Set(current.summaries.map(s => s.type));

    // Was mining, now fighting
    if (prevTypes.has('block_mined') && !currentTypes.has('block_mined') && currentTypes.has('hostile_killed')) {
      return {
        type: PatternType.CONTRAST,
        from: 'mining',
        to: 'combat',
        description: 'Interrupted mining by combat encounter',
      };
    }

    // Was peaceful, now taking damage
    if (!prevTypes.has('damage_taken') && currentTypes.has('damage_taken')) {
      return {
        type: PatternType.CONTRAST,
        from: 'peaceful',
        to: 'under_attack',
        description: 'Peaceful period ended - now under attack',
      };
    }

    return null;
  }

  function getCumulativeCount(type) {
    return cumulativeCounts.get(type) ?? 0;
  }

  function getMilestones() {
    return [...reachedMilestones];
  }

  function getStats() {
    return Object.freeze({
      historySize: history.length,
      cumulativeCounts: Object.fromEntries(cumulativeCounts),
      milestones: [...reachedMilestones],
    });
  }

  function reset() {
    history = [];
    cumulativeCounts = new Map();
    reachedMilestones = new Set();
  }

  return Object.freeze({
    detect,
    getCumulativeCount,
    getMilestones,
    getStats,
    reset,
    PatternType,
  });
}

export default createPatternDetector;
