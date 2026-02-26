// ClawCraft - Working Memory
// RAM: holds current state, recent events, active context
// Volatile - cleared on restart. Fast access for instincts and planning.

import { createLogger } from '../utils/logger.js';

const log = createLogger('Memory:Working');

export function createWorkingMemory(maxSize = 50) {
  let entries = [];
  let context = {};
  let activeTask = null;
  let recentActions = [];
  const MAX_ACTIONS = 20;

  function store(key, value, ttlMs = null) {
    // Remove existing entry with same key
    entries = entries.filter(e => e.key !== key);

    const entry = Object.freeze({
      key,
      value,
      storedAt: Date.now(),
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });

    entries = [...entries, entry];

    // Evict oldest if over capacity
    if (entries.length > maxSize) {
      entries = entries.slice(-maxSize);
    }
  }

  function recall(key) {
    cleanup();
    const entry = entries.find(e => e.key === key);
    return entry ? entry.value : null;
  }

  function recallAll() {
    cleanup();
    return entries.map(e => ({ key: e.key, value: e.value }));
  }

  function forget(key) {
    entries = entries.filter(e => e.key !== key);
  }

  function cleanup() {
    const now = Date.now();
    entries = entries.filter(e => !e.expiresAt || e.expiresAt > now);
  }

  function setContext(key, value) {
    context = { ...context, [key]: value };
  }

  function getContext(key = null) {
    if (key) return context[key] ?? null;
    return { ...context };
  }

  function clearContext() {
    context = {};
  }

  function setActiveTask(task) {
    activeTask = task ? { ...task } : null;
  }

  function getActiveTask() {
    return activeTask;
  }

  function recordAction(action) {
    recentActions = [...recentActions, {
      ...action,
      timestamp: Date.now(),
    }];

    if (recentActions.length > MAX_ACTIONS) {
      recentActions = recentActions.slice(-MAX_ACTIONS);
    }
  }

  function getRecentActions(limit = 10) {
    return recentActions.slice(-limit);
  }

  function getSummary() {
    cleanup();
    return Object.freeze({
      entriesCount: entries.length,
      maxSize,
      contextKeys: Object.keys(context),
      activeTask: activeTask?.name ?? null,
      recentActionsCount: recentActions.length,
    });
  }

  function clear() {
    entries = [];
    context = {};
    activeTask = null;
    recentActions = [];
    log.info('Working memory cleared');
  }

  return Object.freeze({
    store,
    recall,
    recallAll,
    forget,
    cleanup,
    setContext,
    getContext,
    clearContext,
    setActiveTask,
    getActiveTask,
    recordAction,
    getRecentActions,
    getSummary,
    clear,
  });
}

export default createWorkingMemory;
