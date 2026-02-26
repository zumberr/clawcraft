// ClawCraft - Entry Point
// Autonomous Minecraft companion agent

import { createAgent } from './core/agent.js';
import { createLogger } from './utils/logger.js';
import config from './config.js';

const log = createLogger('Main');

console.log(`
   ██████╗██╗      █████╗ ██╗    ██╗ ██████╗██████╗  █████╗ ███████╗████████╗
  ██╔════╝██║     ██╔══██╗██║    ██║██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
  ██║     ██║     ███████║██║ █╗ ██║██║     ██████╔╝███████║█████╗     ██║
  ██║     ██║     ██╔══██║██║███╗██║██║     ██╔══██╗██╔══██║██╔══╝     ██║
  ╚██████╗███████╗██║  ██║╚███╔███╔╝╚██████╗██║  ██║██║  ██║██║        ██║
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝
  v0.1.0 - Loyal Companion
`);

async function main() {
  log.info('Starting ClawCraft...');
  log.info(`Server: ${config.minecraft.host}:${config.minecraft.port}`);
  log.info(`Bot: ${config.minecraft.username}`);
  log.info(`LLM: ${config.llm.provider} (${config.llm.model})`);

  let agent;

  try {
    agent = await createAgent();
    log.info('Agent initialized successfully');

    // Seed initial knowledge
    agent.memory.semantic.seedKnowledge();

    // Handle graceful shutdown
    const shutdown = async () => {
      log.info('Shutdown signal received...');
      if (agent) {
        await agent.shutdown();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the main loop
    await agent.start();
  } catch (err) {
    log.error(`Fatal error: ${err.message}`);
    log.error(err.stack);

    if (agent) {
      try { await agent.shutdown(); } catch { /* best effort */ }
    }

    process.exit(1);
  }
}

main();
