// ClawCraft - Life Driver
// Bridge between Soul (motivations, schedule) and Planning (goals)
// Converts motivation:urge events into autonomous goals
// Converts schedule:periodChanged events into schedule-based goals
// This is what makes the agent "feel alive" - it acts on its own drives

import { createLogger } from '../utils/logger.js';
import { GoalSource } from '../planning/goal-manager.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Soul:LifeDriver');

// Maps internal needs to concrete, decomposable goal names
const NEED_TO_GOAL = Object.freeze({
  survival: { goalName: 'eat_food', basePriority: 0.9, description: 'Find and eat food to restore health' },
  security: { goalName: 'patrol_area', basePriority: 0.7, description: 'Patrol the area and ensure safety' },
  social: { goalName: 'follow_master', basePriority: 0.6, description: 'Find and accompany my master' },
  competence: { goalName: 'make_stone_tools', basePriority: 0.5, description: 'Craft better tools to improve skills' },
  exploration: { goalName: 'explore_area', basePriority: 0.5, description: 'Explore unknown areas nearby' },
  creation: { goalName: 'tend_farm', basePriority: 0.5, description: 'Tend crops and build things' },
  purpose: { goalName: 'organize_inventory', basePriority: 0.4, description: 'Organize items and stay productive' },
});

// Maps schedule activities to goal names
const ACTIVITY_TO_GOAL = Object.freeze({
  work: { goalName: 'get_wood', priority: 0.6, description: 'Gather resources - primary work shift' },
  farm: { goalName: 'tend_farm', priority: 0.6, description: 'Tend crops and harvest' },
  guard: { goalName: 'patrol_area', priority: 0.7, description: 'Guard and patrol the perimeter' },
  rest: { goalName: 'rest_near_bed', priority: 0.3, description: 'Rest and recover energy' },
  prepare: { goalName: 'organize_inventory', priority: 0.5, description: 'Prepare tools and organize supplies' },
  organize: { goalName: 'organize_inventory', priority: 0.5, description: 'Sort inventory and store items' },
  explore: { goalName: 'explore_area', priority: 0.5, description: 'Explore and discover new places' },
  serve: null, // Master gives commands directly, no auto-goal
});

// Per-goal cooldowns to prevent spam (ms)
const GOAL_COOLDOWNS = Object.freeze({
  eat_food: 120000,          // 2 min
  patrol_area: 180000,       // 3 min
  follow_master: 150000,     // 2.5 min
  make_stone_tools: 300000,  // 5 min
  explore_area: 240000,      // 4 min
  tend_farm: 240000,         // 4 min
  organize_inventory: 300000, // 5 min
  rest_near_bed: 300000,     // 5 min
  get_wood: 240000,          // 4 min
});

// How much to satisfy a drive when its corresponding goal completes
const GOAL_SATISFACTION = Object.freeze({
  eat_food: { need: 'survival', amount: 0.4 },
  patrol_area: { need: 'security', amount: 0.3 },
  follow_master: { need: 'social', amount: 0.35 },
  make_stone_tools: { need: 'competence', amount: 0.3 },
  explore_area: { need: 'exploration', amount: 0.35 },
  tend_farm: { need: 'creation', amount: 0.3 },
  organize_inventory: { need: 'purpose', amount: 0.25 },
  rest_near_bed: { need: 'survival', amount: 0.2 },
  get_wood: { need: 'purpose', amount: 0.2 },
});

const COMMAND_SUPPRESS_MS = 30000; // 30s after a player command

export function createLifeDriver(bus, goalManager, behaviorManager, motivations, schedule) {
  let enabled = true;
  let suppressUntil = 0;
  let lastGoalCreatedAt = new Map(); // goalName -> timestamp
  let goalsCreated = 0;

  function initialize() {
    bus.on('motivation:urge', onMotivationUrge);
    bus.on('schedule:periodChanged', onScheduleChanged);
    bus.on('command:received', onCommandReceived);
    bus.on('goal:completed', onGoalCompleted);

    log.info('LifeDriver initialized - autonomous goal creation active');
  }

  function onMotivationUrge(event) {
    if (!enabled) return;
    if (Date.now() < suppressUntil) return;

    const { need, level, goalName: eventGoalName } = event.data;

    // Don't override active player commands
    const activeBehavior = behaviorManager.getActive();
    if (activeBehavior && activeBehavior.requester !== 'self') return;

    const mapping = NEED_TO_GOAL[need];
    if (!mapping) return;

    const goalName = eventGoalName ?? mapping.goalName;

    // Check cooldown
    if (isOnCooldown(goalName)) return;

    // Check for duplicate active/pending goals across all sources
    if (hasDuplicateGoal(goalName)) return;

    const priority = Math.round(mapping.basePriority * level * 100) / 100;

    goalManager.addGoal({
      name: goalName,
      description: mapping.description,
      priority,
      source: GoalSource.AUTONOMOUS,
      metadata: { need, level, origin: 'motivation_urge' },
    });

    lastGoalCreatedAt = new Map([...lastGoalCreatedAt, [goalName, Date.now()]]);
    goalsCreated++;

    log.info(`Autonomous goal from urge: "${goalName}" (need: ${need}, level: ${level.toFixed(2)}, priority: ${priority})`);
  }

  function onScheduleChanged(event) {
    if (!enabled) return;

    const { newPeriod, activity } = event.data;

    // Cancel old schedule goals
    const oldScheduleGoals = goalManager.getGoalsBySource(GoalSource.SCHEDULE);
    for (const goal of oldScheduleGoals) {
      goalManager.cancelGoal(goal.id);
    }

    if (!activity) return;

    const mapping = ACTIVITY_TO_GOAL[activity.activity];
    if (!mapping) return; // 'serve' or unknown activity

    const goalName = mapping.goalName;

    // Check cooldown
    if (isOnCooldown(goalName)) return;

    // Check for duplicate (could exist from motivation/autonomous system)
    if (hasDuplicateGoal(goalName)) return;

    goalManager.addGoal({
      name: goalName,
      description: `${mapping.description} (${newPeriod})`,
      priority: mapping.priority,
      source: GoalSource.SCHEDULE,
      metadata: { period: newPeriod, activity: activity.activity, origin: 'schedule' },
    });

    lastGoalCreatedAt = new Map([...lastGoalCreatedAt, [goalName, Date.now()]]);
    goalsCreated++;

    log.info(`Schedule goal: "${goalName}" for period ${newPeriod} (activity: ${activity.activity})`);
  }

  function onCommandReceived() {
    suppressUntil = Date.now() + COMMAND_SUPPRESS_MS;
    log.debug('Player command received - suppressing autonomous goals for 30s');
  }

  function onGoalCompleted(event) {
    const goal = event.data;
    if (!goal || !goal.name) return;

    const satisfaction = GOAL_SATISFACTION[goal.name];
    if (satisfaction) {
      motivations.satisfy(satisfaction.need, satisfaction.amount);
      log.debug(`Goal "${goal.name}" completed - satisfied ${satisfaction.need} by ${satisfaction.amount}`);
    }
  }

  function isOnCooldown(goalName) {
    const lastCreated = lastGoalCreatedAt.get(goalName);
    if (!lastCreated) return false;

    const cooldown = GOAL_COOLDOWNS[goalName] ?? 180000;
    return Date.now() - lastCreated < cooldown;
  }

  function hasDuplicateGoal(goalName) {
    const sources = Object.values(GoalSource);
    for (const source of sources) {
      const existing = goalManager.getGoalsBySource(source);
      if (existing.some((g) => g.name === goalName)) {
        return true;
      }
    }
    return false;
  }

  function setEnabled(value) {
    enabled = value;
    log.info(`LifeDriver ${enabled ? 'enabled' : 'disabled'}`);
  }

  function getStatus() {
    return Object.freeze({
      enabled,
      suppressed: Date.now() < suppressUntil,
      suppressRemainingMs: Math.max(0, suppressUntil - Date.now()),
      goalsCreated,
      cooldowns: Object.fromEntries(
        [...lastGoalCreatedAt].map(([name, time]) => {
          const cooldown = GOAL_COOLDOWNS[name] ?? 180000;
          const remaining = Math.max(0, cooldown - (Date.now() - time));
          return [name, { lastCreated: time, remainingMs: remaining }];
        }),
      ),
    });
  }

  return Object.freeze({
    initialize,
    setEnabled,
    getStatus,
  });
}

export default createLifeDriver;
