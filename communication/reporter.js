// ClawCraft - Reporter
// Sends routine and emergency reports through MC chat and Discord
// No LLM needed for routine reports - templated messages

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Reporter');

export const ReportLevel = Object.freeze({
  ROUTINE: 'routine',
  WARNING: 'warning',
  EMERGENCY: 'emergency',
});

export function createReporter(bus, discordBridge) {
  let reportHistory = [];
  const MAX_HISTORY = 50;

  function sendRoutine(message) {
    const report = createReport(ReportLevel.ROUTINE, message);
    deliver(report);
  }

  function sendWarning(message) {
    const report = createReport(ReportLevel.WARNING, message);
    deliver(report);
  }

  function sendEmergency(message) {
    const report = createReport(ReportLevel.EMERGENCY, message);
    deliver(report);

    log.warn(`EMERGENCY REPORT: ${message}`);
  }

  function createReport(level, message) {
    const prefixes = {
      [ReportLevel.ROUTINE]: '[Reporte]',
      [ReportLevel.WARNING]: '[Aviso]',
      [ReportLevel.EMERGENCY]: '[EMERGENCIA]',
    };

    return Object.freeze({
      level,
      message: `${prefixes[level]} ${message}`,
      rawMessage: message,
      timestamp: Date.now(),
    });
  }

  function deliver(report) {
    // Send to MC chat (shortened for chat limit)
    const chatLines = report.message.split('\n');
    for (const line of chatLines.slice(0, 3)) { // Max 3 lines in MC chat
      bus.emit('chat:outgoing', { message: line }, EventCategory.CHAT);
    }

    // Send full report to Discord
    if (discordBridge?.isConnected()) {
      const discordFormatted = formatForDiscord(report);
      discordBridge.sendToDiscord(discordFormatted);
    }

    // Record
    reportHistory = [...reportHistory, report];
    if (reportHistory.length > MAX_HISTORY) {
      reportHistory = reportHistory.slice(-MAX_HISTORY);
    }

    log.info(`Report sent (${report.level}): ${report.rawMessage.slice(0, 80)}`);
  }

  function formatForDiscord(report) {
    const levelEmoji = {
      [ReportLevel.ROUTINE]: '🟢',
      [ReportLevel.WARNING]: '🟡',
      [ReportLevel.EMERGENCY]: '🔴',
    };

    const emoji = levelEmoji[report.level] ?? '📋';
    const time = new Date(report.timestamp).toLocaleTimeString();

    return `${emoji} **${report.level.toUpperCase()}** (${time})\n${report.rawMessage}`;
  }

  function getHistory(level = null, limit = 10) {
    let filtered = reportHistory;
    if (level) {
      filtered = filtered.filter(r => r.level === level);
    }
    return filtered.slice(-limit);
  }

  function getStats() {
    const counts = { routine: 0, warning: 0, emergency: 0 };
    for (const report of reportHistory) {
      counts[report.level] = (counts[report.level] || 0) + 1;
    }
    return Object.freeze({
      total: reportHistory.length,
      ...counts,
    });
  }

  return Object.freeze({
    sendRoutine,
    sendWarning,
    sendEmergency,
    getHistory,
    getStats,
  });
}

export default createReporter;
