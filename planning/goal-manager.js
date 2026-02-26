// ClawCraft - Goal Manager
// Tracks active goals, their priorities, and dependencies

import { createLogger } from '../utils/logger.js';
import { uid } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('GoalManager');

export const GoalStatus = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const GoalSource = Object.freeze({
  COMMAND: 'command',       // Player told us to do it
  AUTONOMOUS: 'autonomous', // Self-motivated
  INSTINCT: 'instinct',    // Survival need
  SCHEDULE: 'schedule',    // Time-based routine
});

export function createGoalManager(bus) {
  let goals = [];

  function addGoal(goalData) {
    const goal = Object.freeze({
      id: uid(),
      name: goalData.name,
      description: goalData.description ?? '',
      priority: goalData.priority ?? 0.5,
      source: goalData.source ?? GoalSource.AUTONOMOUS,
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      deadline: goalData.deadline ?? null,
      requester: goalData.requester ?? null,
      subtasks: goalData.subtasks ?? [],
      metadata: goalData.metadata ?? {},
    });

    goals = [...goals, goal];
    goals.sort((a, b) => b.priority - a.priority);

    bus.emit('goal:added', goal, EventCategory.TASK);
    log.info(`Goal added: "${goal.name}" (priority: ${goal.priority}, source: ${goal.source})`);

    return goal.id;
  }

  function activateGoal(id) {
    goals = goals.map(g =>
      g.id === id ? { ...g, status: GoalStatus.ACTIVE } : g,
    );
    const goal = getGoal(id);
    if (goal) {
      bus.emit('goal:activated', goal, EventCategory.TASK);
      log.info(`Goal activated: "${goal.name}"`);
    }
  }

  function completeGoal(id) {
    goals = goals.map(g =>
      g.id === id ? { ...g, status: GoalStatus.COMPLETED } : g,
    );
    const goal = getGoal(id);
    if (goal) {
      bus.emit('goal:completed', goal, EventCategory.TASK);
      log.info(`Goal completed: "${goal.name}"`);
    }
  }

  function failGoal(id, reason = '') {
    goals = goals.map(g =>
      g.id === id ? { ...g, status: GoalStatus.FAILED, metadata: { ...g.metadata, failReason: reason } } : g,
    );
    const goal = getGoal(id);
    if (goal) {
      bus.emit('goal:failed', { ...goal, reason }, EventCategory.TASK);
      log.warn(`Goal failed: "${goal.name}" - ${reason}`);
    }
  }

  function cancelGoal(id) {
    goals = goals.map(g =>
      g.id === id ? { ...g, status: GoalStatus.CANCELLED } : g,
    );
  }

  function pauseGoal(id) {
    goals = goals.map(g =>
      g.id === id ? { ...g, status: GoalStatus.PAUSED } : g,
    );
  }

  function getGoal(id) {
    return goals.find(g => g.id === id) ?? null;
  }

  function getActiveGoals() {
    return goals.filter(g => g.status === GoalStatus.ACTIVE);
  }

  function getPendingGoals() {
    return goals.filter(g => g.status === GoalStatus.PENDING);
  }

  function getTopGoal() {
    const active = getActiveGoals();
    if (active.length > 0) return active[0];
    const pending = getPendingGoals();
    return pending[0] ?? null;
  }

  function getGoalsBySource(source) {
    return goals.filter(g => g.source === source && g.status !== GoalStatus.COMPLETED && g.status !== GoalStatus.CANCELLED);
  }

  function reprioritize(id, newPriority) {
    goals = goals.map(g =>
      g.id === id ? { ...g, priority: newPriority } : g,
    );
    goals.sort((a, b) => b.priority - a.priority);
  }

  function cleanup() {
    // Remove old completed/failed goals
    const cutoff = Date.now() - 600000; // 10 minutes
    goals = goals.filter(g =>
      g.status === GoalStatus.ACTIVE ||
      g.status === GoalStatus.PENDING ||
      g.status === GoalStatus.PAUSED ||
      g.createdAt > cutoff
    );
  }

  function getStatus() {
    return Object.freeze({
      total: goals.length,
      active: getActiveGoals().length,
      pending: getPendingGoals().length,
      topGoal: getTopGoal()?.name ?? 'none',
    });
  }

  return Object.freeze({
    addGoal,
    activateGoal,
    completeGoal,
    failGoal,
    cancelGoal,
    pauseGoal,
    getGoal,
    getActiveGoals,
    getPendingGoals,
    getTopGoal,
    getGoalsBySource,
    reprioritize,
    cleanup,
    getStatus,
  });
}

export default createGoalManager;
