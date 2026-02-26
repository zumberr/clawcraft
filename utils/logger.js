// ClawCraft - Logger
// Structured logging with levels, timestamps, and optional file output

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import config from '../config.js';

const LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});

const COLORS = Object.freeze({
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  reset: '\x1b[0m',
  dim: '\x1b[2m',
});

const currentLevel = LEVELS[config.log.level] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, tag, message, data) {
  const ts = timestamp();
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : '';
  return { raw: `[${ts}] [${level.toUpperCase()}] [${tag}]${message}${dataStr}`, level, ts, tag };
}

function writeToFile(formatted) {
  if (!config.log.file) return;
  try {
    mkdirSync(dirname(config.log.file), { recursive: true });
    appendFileSync(config.log.file, formatted.raw + '\n');
  } catch {
    // Silently fail file logging to avoid infinite loops
  }
}

function writeToConsole(level, tag, message, data) {
  if (!config.log.console) return;
  const color = COLORS[level] ?? COLORS.reset;
  const ts = `${COLORS.dim}${timestamp()}${COLORS.reset}`;
  const lvl = `${color}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const tagStr = `${COLORS.dim}[${tag}]${COLORS.reset}`;
  const dataStr = data !== undefined ? `\n${JSON.stringify(data, null, 2)}` : '';
  console.log(`${ts} ${lvl} ${tagStr} ${message}${dataStr}`);
}

export function createLogger(tag) {
  const log = (level, message, data) => {
    if (LEVELS[level] < currentLevel) return;
    const formatted = formatMessage(level, tag, message, data);
    writeToFile(formatted);
    writeToConsole(level, tag, message, data);
  };

  return Object.freeze({
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  });
}

export default createLogger;
