// ClawCraft - Adaptive Schedule System
// Time-based behavior patterns, inspired by Touhou Little Maid's maid schedules
// The bot follows a daily rhythm that adapts to personality and player presence
// Schedules affect what the bot does autonomously when idle

import { createLogger } from "../utils/logger.js";
import { EventCategory } from "../core/event-bus.js";

const log = createLogger("Soul:Schedule");

// Minecraft time: 0-24000 ticks, 1 real second = 72 game ticks
// Dawn: 0, Noon: 6000, Dusk: 12000, Midnight: 18000
const TIME_PERIODS = Object.freeze({
  EARLY_MORNING: { start: 0, end: 2000, label: "early_morning" },
  MORNING: { start: 2000, end: 6000, label: "morning" },
  MIDDAY: { start: 6000, end: 10000, label: "midday" },
  AFTERNOON: { start: 10000, end: 12000, label: "afternoon" },
  EVENING: { start: 12000, end: 14000, label: "evening" },
  NIGHT: { start: 14000, end: 22000, label: "night" },
  LATE_NIGHT: { start: 22000, end: 24000, label: "late_night" },
});

// Default activity schedule (modified by personality)
const DEFAULT_SCHEDULE = Object.freeze({
  early_morning: {
    activity: "prepare",
    priority: "crafting",
    description: "Prepare tools and supplies",
  },
  morning: {
    activity: "work",
    priority: "mining",
    description: "Primary work: mining, gathering",
  },
  midday: {
    activity: "work",
    priority: "building",
    description: "Build and construct",
  },
  afternoon: {
    activity: "farm",
    priority: "farming",
    description: "Tend to farms and animals",
  },
  evening: {
    activity: "organize",
    priority: "inventory",
    description: "Organize inventory, store items",
  },
  night: {
    activity: "guard",
    priority: "patrol",
    description: "Guard and patrol the area",
  },
  late_night: {
    activity: "rest",
    priority: "idle",
    description: "Rest near bed or home",
  },
});

export function createSchedule(bus, personality, socialMemory = null) {
  let schedule = { ...DEFAULT_SCHEDULE };
  let currentPeriod = null;
  let lastGameTime = 0;
  let overrides = new Map(); // period -> override activity (temporary)
  let nearbyPlayerNames = new Set();
  let playerPresent = false;
  let masterPresent = false;

  function initialize() {
    applyPersonalityModifiers();
    wireEvents();
    log.info("Schedule initialized");
  }

  function applyPersonalityModifiers() {
    const traits = personality.getPersona().traits ?? [];
    const traitSet = new Set(traits.map((t) => t.toLowerCase()));

    // Industrious/diligent -> extend work periods
    if (
      traitSet.has("industrious") ||
      traitSet.has("diligent") ||
      traitSet.has("hardworking")
    ) {
      schedule = {
        ...schedule,
        evening: {
          activity: "work",
          priority: "building",
          description: "Extra work shift",
        },
      };
    }

    // Protective/loyal -> more guard time
    if (
      traitSet.has("protective") ||
      traitSet.has("loyal") ||
      traitSet.has("vigilant")
    ) {
      schedule = {
        ...schedule,
        late_night: {
          activity: "guard",
          priority: "patrol",
          description: "Extended guard patrol",
        },
      };
    }

    // Curious/explorer -> more exploration
    if (traitSet.has("curious") || traitSet.has("adventurous")) {
      schedule = {
        ...schedule,
        afternoon: {
          activity: "explore",
          priority: "exploration",
          description: "Explore surroundings",
        },
      };
    }

    log.debug("Schedule adapted to personality");
  }

  function wireEvents() {
    bus.on("world:timeUpdate", (event) => {
      updateTime(event.data.time ?? event.data.timeOfDay ?? 0);
    });

    bus.on("entity:playerAppeared", (event) => {
      const playerName = event.data.name;
      if (playerName) {
        nearbyPlayerNames = new Set([...nearbyPlayerNames, playerName]);
      }

      playerPresent = nearbyPlayerNames.size > 0;
      if (isMasterEvent(event)) {
        masterPresent = true;
      }
    });

    bus.on("entity:playerLeft", (event) => {
      const playerName = event.data.name;
      if (playerName) {
        const updated = new Set(nearbyPlayerNames);
        updated.delete(playerName);
        nearbyPlayerNames = updated;
      }

      playerPresent = nearbyPlayerNames.size > 0;
      masterPresent = [...nearbyPlayerNames].some(
        (name) => socialMemory?.isMaster(name) ?? false,
      );
    });
  }

  function isMasterEvent(event) {
    if (typeof event.data.isMaster === "boolean") {
      return event.data.isMaster;
    }

    return socialMemory?.isMaster(event.data.name) ?? false;
  }

  function updateTime(gameTime) {
    lastGameTime = gameTime % 24000;
    const newPeriod = getPeriodForTime(lastGameTime);

    if (newPeriod !== currentPeriod) {
      const oldPeriod = currentPeriod;
      currentPeriod = newPeriod;

      log.info(`Period changed: ${oldPeriod ?? "none"} -> ${currentPeriod}`);

      bus.emit(
        "schedule:periodChanged",
        {
          oldPeriod,
          newPeriod: currentPeriod,
          activity: getCurrentActivity(),
        },
        EventCategory.SOUL,
      );
    }
  }

  function getPeriodForTime(time) {
    for (const [, period] of Object.entries(TIME_PERIODS)) {
      if (time >= period.start && time < period.end) {
        return period.label;
      }
    }
    return "early_morning"; // fallback
  }

  function getCurrentActivity() {
    if (!currentPeriod) return null;

    // Check for temporary overrides
    if (overrides.has(currentPeriod)) {
      return overrides.get(currentPeriod);
    }

    // Master present -> prioritize serving
    if (masterPresent) {
      return {
        activity: "serve",
        priority: "commands",
        description: "Awaiting master commands",
      };
    }

    return schedule[currentPeriod] ?? null;
  }

  function getScheduledPriority() {
    const activity = getCurrentActivity();
    return activity?.priority ?? "idle";
  }

  function setOverride(period, activity, duration = null) {
    overrides.set(period, activity);

    if (duration) {
      setTimeout(() => overrides.delete(period), duration);
    }

    log.info(`Schedule override: ${period} -> ${activity.activity}`);
  }

  function clearOverride(period) {
    overrides.delete(period);
  }

  function clearAllOverrides() {
    overrides.clear();
  }

  function isWorkTime() {
    const activity = getCurrentActivity();
    return activity?.activity === "work" || activity?.activity === "farm";
  }

  function isRestTime() {
    const activity = getCurrentActivity();
    return activity?.activity === "rest";
  }

  function isGuardTime() {
    const activity = getCurrentActivity();
    return activity?.activity === "guard";
  }

  function getStatus() {
    return Object.freeze({
      currentPeriod,
      gameTime: lastGameTime,
      currentActivity: getCurrentActivity(),
      playerPresent,
      masterPresent,
      nearbyPlayers: [...nearbyPlayerNames],
      overrides: Object.fromEntries(overrides),
      fullSchedule: { ...schedule },
    });
  }

  return Object.freeze({
    initialize,
    updateTime,
    getCurrentActivity,
    getScheduledPriority,
    setOverride,
    clearOverride,
    clearAllOverrides,
    isWorkTime,
    isRestTime,
    isGuardTime,
    getStatus,
    TIME_PERIODS,
  });
}

export default createSchedule;
