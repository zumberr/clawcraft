// ClawCraft - Task Queue
// FIFO queue with priority override for urgent tasks

import { createLogger } from '../utils/logger.js';

const log = createLogger('TaskQueue');

export function createTaskQueue() {
  let queue = [];
  let currentTask = null;
  let history = [];
  const MAX_HISTORY = 50;

  function enqueue(task, priority = false) {
    if (priority) {
      queue = [task, ...queue];
      log.info(`Priority task queued: "${task.name}"`);
    } else {
      queue = [...queue, task];
      log.debug(`Task queued: "${task.name}" (position: ${queue.length})`);
    }
  }

  function enqueueBatch(tasks) {
    queue = [...queue, ...tasks];
    log.info(`Batch queued: ${tasks.length} tasks`);
  }

  function dequeue() {
    if (queue.length === 0) return null;

    const [next, ...rest] = queue;
    queue = rest;
    currentTask = { ...next, status: 'in_progress', startedAt: Date.now() };

    log.info(`Starting task: "${currentTask.name}"`);
    return currentTask;
  }

  function peek() {
    return queue[0] ?? null;
  }

  function completeCurrent(result = {}) {
    if (!currentTask) return;

    const completed = {
      ...currentTask,
      status: 'completed',
      completedAt: Date.now(),
      duration: Date.now() - currentTask.startedAt,
      result,
    };

    history = [...history, completed];
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    log.info(`Task completed: "${completed.name}" (${completed.duration}ms)`);
    currentTask = null;

    return completed;
  }

  function failCurrent(reason = '') {
    if (!currentTask) return;

    const failed = {
      ...currentTask,
      status: 'failed',
      failedAt: Date.now(),
      reason,
      attempts: (currentTask.attempts || 0) + 1,
    };

    // Retry if under max attempts
    if (failed.attempts < (failed.maxAttempts || 3)) {
      log.warn(`Task failed: "${failed.name}" (attempt ${failed.attempts}) - retrying`);
      queue = [{ ...failed, status: 'pending' }, ...queue];
    } else {
      log.error(`Task failed permanently: "${failed.name}" - ${reason}`);
      history = [...history, failed];
    }

    currentTask = null;
    return failed;
  }

  function skipCurrent() {
    if (!currentTask) return;
    const skipped = { ...currentTask, status: 'skipped' };
    history = [...history, skipped];
    currentTask = null;
    log.info(`Task skipped: "${skipped.name}"`);
  }

  function clear() {
    queue = [];
    currentTask = null;
    log.info('Task queue cleared');
  }

  function remove(taskId) {
    queue = queue.filter(t => t.id !== taskId);
  }

  function getCurrent() {
    return currentTask;
  }

  function getQueue() {
    return [...queue];
  }

  function getHistory(limit = 10) {
    return history.slice(-limit);
  }

  function size() {
    return queue.length;
  }

  function isEmpty() {
    return queue.length === 0 && currentTask === null;
  }

  function getStatus() {
    return Object.freeze({
      queueSize: queue.length,
      currentTask: currentTask?.name ?? null,
      nextTask: queue[0]?.name ?? null,
      completedCount: history.filter(t => t.status === 'completed').length,
      failedCount: history.filter(t => t.status === 'failed').length,
    });
  }

  return Object.freeze({
    enqueue,
    enqueueBatch,
    dequeue,
    peek,
    completeCurrent,
    failCurrent,
    skipCurrent,
    clear,
    remove,
    getCurrent,
    getQueue,
    getHistory,
    size,
    isEmpty,
    getStatus,
  });
}

export default createTaskQueue;
