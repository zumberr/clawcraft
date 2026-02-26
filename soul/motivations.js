// ClawCraft - Motivations
// Internal drives that generate autonomous goals when idle

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';
import { clamp } from '../utils/helpers.js';

const log = createLogger('Soul:Motivations');

// Basic needs (Maslow-inspired for a Minecraft bot)
const NEEDS = Object.freeze({
  SURVIVAL: 'survival',       // Food, shelter, health
  SECURITY: 'security',       // Armor, weapons, safe base
  SOCIAL: 'social',           // Be near master, help others
  COMPETENCE: 'competence',   // Improve skills, get better tools
  EXPLORATION: 'exploration',  // Discover new places
  CREATION: 'creation',       // Build things, farm, craft
  PURPOSE: 'purpose',         // Serve master, complete missions
});

export function createMotivations(bus) {
  // Drive levels (0 = fully satisfied, 1 = desperate need)
  let drives = {
    [NEEDS.SURVIVAL]: 0.0,
    [NEEDS.SECURITY]: 0.3,
    [NEEDS.SOCIAL]: 0.4,
    [NEEDS.COMPETENCE]: 0.3,
    [NEEDS.EXPLORATION]: 0.5,
    [NEEDS.CREATION]: 0.3,
    [NEEDS.PURPOSE]: 0.5,
  };

  // Natural growth rates (drives increase over time)
  const growthRates = {
    [NEEDS.SURVIVAL]: 0.001,
    [NEEDS.SECURITY]: 0.0005,
    [NEEDS.SOCIAL]: 0.002,
    [NEEDS.COMPETENCE]: 0.001,
    [NEEDS.EXPLORATION]: 0.0015,
    [NEEDS.CREATION]: 0.001,
    [NEEDS.PURPOSE]: 0.002,
  };

  // Wire events that satisfy drives
  bus.on('instinct:ate', () => satisfy(NEEDS.SURVIVAL, 0.3));
  bus.on('health:heal', () => satisfy(NEEDS.SURVIVAL, 0.1));
  bus.on('entity:playerAppeared', () => satisfy(NEEDS.SOCIAL, 0.2));
  bus.on('command:received', () => {
    satisfy(NEEDS.PURPOSE, 0.3);
    satisfy(NEEDS.SOCIAL, 0.1);
  });
  bus.on('task:completed', () => {
    satisfy(NEEDS.COMPETENCE, 0.1);
    satisfy(NEEDS.PURPOSE, 0.2);
  });
  bus.on('world:poiDiscovered', () => satisfy(NEEDS.EXPLORATION, 0.15));
  bus.on('world:homeSet', () => satisfy(NEEDS.SECURITY, 0.3));
  bus.on('health:damage', () => increase(NEEDS.SURVIVAL, 0.2));
  bus.on('health:hunger', () => increase(NEEDS.SURVIVAL, 0.15));
  bus.on('agent:death', () => {
    increase(NEEDS.SURVIVAL, 0.5);
    increase(NEEDS.SECURITY, 0.3);
  });

  function satisfy(need, amount) {
    if (!(need in drives)) return;
    drives = { ...drives, [need]: clamp(drives[need] - amount, 0, 1) };
  }

  function increase(need, amount) {
    if (!(need in drives)) return;
    drives = { ...drives, [need]: clamp(drives[need] + amount, 0, 1) };
  }

  /**
   * Called periodically - grows drives and emits suggestions
   */
  function update() {
    // Natural drive growth
    const newDrives = {};
    for (const [need, level] of Object.entries(drives)) {
      newDrives[need] = clamp(level + (growthRates[need] || 0), 0, 1);
    }
    drives = newDrives;

    // Find the strongest unsatisfied drive
    const strongest = getStrongestDrive();
    if (strongest && strongest.level > 0.7) {
      bus.emit('motivation:urge', {
        need: strongest.need,
        level: strongest.level,
        suggestion: getSuggestion(strongest.need),
      }, EventCategory.SOUL);
    }
  }

  function getStrongestDrive() {
    let strongest = null;
    let maxLevel = 0;

    for (const [need, level] of Object.entries(drives)) {
      if (level > maxLevel) {
        maxLevel = level;
        strongest = { need, level };
      }
    }

    return strongest;
  }

  function getSuggestion(need) {
    const suggestions = {
      [NEEDS.SURVIVAL]: 'Find food or heal',
      [NEEDS.SECURITY]: 'Improve base defenses or get better armor',
      [NEEDS.SOCIAL]: 'Find my master or interact with players',
      [NEEDS.COMPETENCE]: 'Craft better tools or learn new recipes',
      [NEEDS.EXPLORATION]: 'Explore unknown areas nearby',
      [NEEDS.CREATION]: 'Build something or start a farm',
      [NEEDS.PURPOSE]: 'Ask master for a task or find something useful to do',
    };
    return suggestions[need] ?? 'Do something productive';
  }

  function getDrives() {
    return Object.freeze({ ...drives });
  }

  function getStatus() {
    const sorted = Object.entries(drives)
      .sort(([, a], [, b]) => b - a)
      .map(([need, level]) => ({ need, level: Math.round(level * 100) / 100 }));

    return Object.freeze({
      drives: sorted,
      strongest: sorted[0] ?? null,
    });
  }

  return Object.freeze({
    update,
    satisfy,
    increase,
    getDrives,
    getStrongestDrive,
    getStatus,
  });
}

export { NEEDS };
export default createMotivations;
