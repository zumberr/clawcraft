// ClawCraft - Configuration
// All settings centralized here. Override with environment variables or data/config.json

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dir, 'data');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

function loadJsonConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return {};
}

const fileConfig = loadJsonConfig();

function env(key, fallback) {
  return process.env[key] ?? fileConfig[key] ?? fallback;
}

export const config = Object.freeze({
  // --- Minecraft Server ---
  minecraft: Object.freeze({
    host: env('MC_HOST', 'localhost'),
    port: parseInt(env('MC_PORT', '25565'), 10),
    username: env('MC_USERNAME', 'ClawCraft'),
    version: env('MC_VERSION', '1.20.4'),
    auth: env('MC_AUTH', 'offline'), // 'offline' | 'microsoft'
  }),

  // --- LLM Provider ---
  llm: Object.freeze({
    provider: env('LLM_PROVIDER', 'anthropic'), // 'anthropic' | 'openai' | 'local'
    model: env('LLM_MODEL', 'claude-sonnet-4-20250514'),
    apiKey: env('LLM_API_KEY', ''),
    baseUrl: env('LLM_BASE_URL', ''),
    maxTokens: parseInt(env('LLM_MAX_TOKENS', '2048'), 10),
    temperature: parseFloat(env('LLM_TEMPERATURE', '0.7')),
  }),

  // --- Discord ---
  discord: Object.freeze({
    enabled: env('DISCORD_ENABLED', 'false') === 'true',
    token: env('DISCORD_TOKEN', ''),
    channelId: env('DISCORD_CHANNEL_ID', ''),
  }),

  // --- Agent Behavior ---
  agent: Object.freeze({
    name: env('AGENT_NAME', 'ClawCraft'),
    tickRate: parseInt(env('TICK_RATE', '50'), 10), // ms between ticks
    thinkInterval: parseInt(env('THINK_INTERVAL', '10000'), 10), // ms between LLM calls
    reflectionInterval: parseInt(env('REFLECTION_INTERVAL', '300000'), 10), // 5 min
    survivalPriority: parseFloat(env('SURVIVAL_PRIORITY', '0.9')),
    obediencePriority: parseFloat(env('OBEDIENCE_PRIORITY', '0.85')),
    autonomyLevel: parseFloat(env('AUTONOMY_LEVEL', '0.5')), // 0 = full servant, 1 = full autonomous
  }),

  // --- Memory ---
  memory: Object.freeze({
    dbPath: join(DATA_DIR, 'world.sqlite'),
    workingMemorySize: parseInt(env('WORKING_MEMORY_SIZE', '50'), 10),
    episodicRetention: parseInt(env('EPISODIC_RETENTION_DAYS', '30'), 10),
    spatialChunkRadius: parseInt(env('SPATIAL_CHUNK_RADIUS', '8'), 10),
  }),

  // --- Logging ---
  log: Object.freeze({
    level: env('LOG_LEVEL', 'info'), // 'debug' | 'info' | 'warn' | 'error'
    file: env('LOG_FILE', join(DATA_DIR, 'clawcraft.log')),
    console: env('LOG_CONSOLE', 'true') === 'true',
  }),
});

export default config;
