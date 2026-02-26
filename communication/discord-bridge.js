// ClawCraft - Discord Bridge
// Bridges Minecraft events to Discord and vice versa

import { Client, GatewayIntentBits } from 'discord.js';
import config from '../config.js';
import { createLogger } from '../utils/logger.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Chat:Discord');

export function createDiscordBridge(bus, messageFormatter) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let channel = null;
  let connected = false;

  async function connect() {
    if (!config.discord.token) {
      log.warn('Discord token not configured, bridge disabled');
      return;
    }

    try {
      await client.login(config.discord.token);
      log.info('Discord bot connected');

      client.on('ready', () => {
        channel = client.channels.cache.get(config.discord.channelId);
        if (!channel) {
          log.warn(`Discord channel ${config.discord.channelId} not found`);
          return;
        }
        connected = true;
        log.info(`Discord bridge active in #${channel.name}`);
      });

      // Forward Discord messages to Minecraft bus
      client.on('messageCreate', (msg) => {
        if (msg.author.bot) return;
        if (msg.channelId !== config.discord.channelId) return;

        bus.emit('chat:incoming', {
          username: msg.author.username,
          message: msg.content,
          type: 'discord',
          source: 'discord',
        }, EventCategory.CHAT);
      });

      // Forward Minecraft events to Discord
      bus.on('chat:outgoing', (event) => {
        if (connected && channel) {
          const clean = event.data.message.replace(/@/g, ''); // Prevent pings
          channel.send(`**ClawCraft:** ${clean}`).catch(() => {});
        }
      });

      bus.on('agent:death', () => {
        sendToDiscord('I died! Respawning...');
      });

      bus.on('combat:engaged', (event) => {
        sendToDiscord(`Fighting ${event.data.target}!`);
      });

    } catch (err) {
      log.error(`Discord connection failed: ${err.message}`);
    }
  }

  async function disconnect() {
    if (connected) {
      await sendToDiscord('Going offline. Goodbye!');
      client.destroy();
      connected = false;
      log.info('Discord bridge disconnected');
    }
  }

  function sendToDiscord(message) {
    if (!connected || !channel) return;
    const formatted = messageFormatter.format(message);
    channel.send(formatted).catch((err) => {
      log.error(`Discord send failed: ${err.message}`);
    });
  }

  function isConnected() {
    return connected;
  }

  return Object.freeze({
    connect,
    disconnect,
    sendToDiscord,
    isConnected,
  });
}

export default createDiscordBridge;
