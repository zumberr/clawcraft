// ClawCraft - Message Formatter
// Adds personality flavor to outgoing messages

import { createLogger } from '../utils/logger.js';
import { randomChoice, truncate } from '../utils/helpers.js';

const log = createLogger('MessageFormatter');

export function createMessageFormatter(personality) {
  const style = personality.getSpeechStyle();

  function format(message) {
    if (!message) return '';

    let formatted = message.trim();

    // Apply verbosity filter - shorten if low verbosity
    if (style.verbosity < 0.3 && formatted.length > 100) {
      formatted = truncate(formatted, 100);
    }

    // Occasionally add catchphrase (10% chance for non-short messages)
    if (formatted.length > 20 && Math.random() < 0.1) {
      const catchphrase = personality.getRandomCatchphrase();
      if (catchphrase) {
        formatted = `${formatted} ${catchphrase}`;
      }
    }

    return formatted;
  }

  /**
   * Format a status update message
   */
  function formatStatus(status) {
    const parts = [];

    if (status.health !== undefined) {
      parts.push(`HP: ${status.health}/20`);
    }
    if (status.food !== undefined) {
      parts.push(`Food: ${status.food}/20`);
    }
    if (status.task) {
      parts.push(`Task: ${status.task}`);
    }
    if (status.position) {
      parts.push(`Pos: (${Math.floor(status.position.x)}, ${Math.floor(status.position.y)}, ${Math.floor(status.position.z)})`);
    }

    return parts.join(' | ');
  }

  /**
   * Format an error/problem message
   */
  function formatError(error) {
    const prefixes = [
      'Hmm, problema:',
      'No pude:',
      'Algo salio mal:',
      'Error:',
    ];
    return `${randomChoice(prefixes)} ${error}`;
  }

  /**
   * Format a task completion message
   */
  function formatCompletion(taskName) {
    const celebrations = [
      `Listo! "${taskName}" completado.`,
      `Hecho: ${taskName}.`,
      `${taskName} terminado.`,
      `Ya esta: ${taskName}.`,
    ];
    return randomChoice(celebrations);
  }

  return Object.freeze({
    format,
    formatStatus,
    formatError,
    formatCompletion,
  });
}

export default createMessageFormatter;
