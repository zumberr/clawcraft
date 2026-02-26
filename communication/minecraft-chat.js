// ClawCraft - Minecraft Chat
// Handles in-game chat: listening, sending, and routing to the thinker

import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';
import { truncate } from '../utils/helpers.js';

const log = createLogger('Chat:MC');

const MAX_CHAT_LENGTH = 256; // Minecraft chat limit

export function createMinecraftChat(bot, bus, messageFormatter) {
  let chatHistory = [];
  const MAX_HISTORY = 100;

  // Listen to incoming chat
  bot.on('chat', (username, message) => {
    if (username === bot.username) return; // Ignore own messages

    const entry = Object.freeze({
      username,
      message,
      timestamp: Date.now(),
      type: 'chat',
    });

    chatHistory = [...chatHistory, entry];
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    log.info(`<${username}> ${message}`);

    bus.emit('chat:incoming', {
      username,
      message,
      type: 'chat',
    }, EventCategory.CHAT);
  });

  // Listen to whispers
  bot.on('whisper', (username, message) => {
    if (username === bot.username) return;

    log.info(`[whisper] <${username}> ${message}`);

    bus.emit('chat:incoming', {
      username,
      message,
      type: 'whisper',
    }, EventCategory.CHAT);
  });

  // Handle outgoing messages from the bus
  bus.on('chat:outgoing', (event) => {
    const { message, target, type } = event.data;
    if (type === 'whisper' && target) {
      whisper(target, message);
    } else {
      send(message);
    }
  });

  function send(message) {
    if (!message) return;

    const formatted = messageFormatter.format(message);
    const chunks = splitMessage(formatted);

    for (const chunk of chunks) {
      bot.chat(chunk);
      log.info(`[send] ${chunk}`);
    }
  }

  function whisper(username, message) {
    if (!message) return;
    const formatted = messageFormatter.format(message);
    bot.whisper(username, truncate(formatted, MAX_CHAT_LENGTH));
    log.info(`[whisper -> ${username}] ${formatted}`);
  }

  function splitMessage(message) {
    if (message.length <= MAX_CHAT_LENGTH) return [message];

    const chunks = [];
    let remaining = message;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHAT_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find last space before limit
      let splitIndex = remaining.lastIndexOf(' ', MAX_CHAT_LENGTH);
      if (splitIndex === -1) splitIndex = MAX_CHAT_LENGTH;

      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
  }

  function getHistory(limit = 20) {
    return chatHistory.slice(-limit);
  }

  function getHistoryWith(username, limit = 10) {
    return chatHistory
      .filter(entry => entry.username === username)
      .slice(-limit);
  }

  return Object.freeze({
    send,
    whisper,
    getHistory,
    getHistoryWith,
  });
}

export default createMinecraftChat;
