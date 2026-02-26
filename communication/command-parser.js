// ClawCraft - Command Parser
// Parses player commands from chat messages

import { createLogger } from '../utils/logger.js';

const log = createLogger('CommandParser');

// Command prefix
const PREFIX = '!';

// Built-in command definitions
const COMMANDS = Object.freeze({
  follow: { description: 'Follow a player', args: ['target?'] },
  stop: { description: 'Stop current task', args: [] },
  come: { description: 'Come to the player', args: [] },
  stay: { description: 'Stay in current position', args: [] },
  go: { description: 'Go to coordinates', args: ['x', 'y', 'z'] },
  mine: { description: 'Mine a block type', args: ['block', 'count?'] },
  craft: { description: 'Craft an item', args: ['item', 'count?'] },
  build: { description: 'Build a structure', args: ['type'] },
  farm: { description: 'Farm crops', args: ['action?'] },
  status: { description: 'Show current status', args: [] },
  inventory: { description: 'List inventory', args: [] },
  home: { description: 'Set or go home', args: ['action?'] },
  master: { description: 'Set master', args: ['name?'] },
  guard: { description: 'Guard the area (autonomous patrol + defense)', args: [] },
  stopguard: { description: 'Stop guarding', args: [] },
  mission: { description: 'Show active mission status', args: [] },
  report: { description: 'Force a status report', args: [] },
  help: { description: 'Show available commands', args: [] },
  say: { description: 'Say something in chat', args: ['message'] },
  think: { description: 'Force a thinking cycle', args: [] },
  memory: { description: 'Show memory stats', args: [] },
  mood: { description: 'Show emotional state', args: [] },
  goals: { description: 'Show current goals', args: [] },
});

export function createCommandParser() {
  function parse(message, username) {
    // Check for command prefix
    if (message.startsWith(PREFIX)) {
      return parseCommand(message.slice(PREFIX.length), username);
    }

    // Check for natural language addressing
    const botNames = ['clawcraft', 'claw'];
    const lowerMsg = message.toLowerCase();

    for (const name of botNames) {
      if (lowerMsg.startsWith(name + ' ') || lowerMsg.startsWith(name + ',')) {
        const content = message.slice(name.length).replace(/^[,\s]+/, '').trim();
        return {
          type: 'natural',
          raw: message,
          content,
          username,
          timestamp: Date.now(),
        };
      }
    }

    // Not addressed to us
    return null;
  }

  function parseCommand(input, username) {
    const parts = input.trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const commandDef = COMMANDS[commandName];
    if (!commandDef) {
      // Unknown command - treat as natural language
      return {
        type: 'natural',
        raw: `${PREFIX}${input}`,
        content: input,
        username,
        timestamp: Date.now(),
      };
    }

    // Parse arguments
    const parsedArgs = {};
    for (let i = 0; i < commandDef.args.length; i++) {
      const argDef = commandDef.args[i];
      const isOptional = argDef.endsWith('?');
      const argName = argDef.replace('?', '');

      if (i < args.length) {
        parsedArgs[argName] = isNaN(args[i]) ? args[i] : Number(args[i]);
      } else if (!isOptional) {
        log.warn(`Missing required argument: ${argName} for !${commandName}`);
      }
    }

    // Special case for !say - join all remaining args
    if (commandName === 'say') {
      parsedArgs.message = args.join(' ');
    }

    log.info(`Command from ${username}: !${commandName} ${JSON.stringify(parsedArgs)}`);

    return {
      type: 'command',
      command: commandName,
      args: parsedArgs,
      raw: `${PREFIX}${input}`,
      username,
      timestamp: Date.now(),
    };
  }

  function getHelpText() {
    const lines = ['Available commands:'];
    for (const [name, def] of Object.entries(COMMANDS)) {
      const argStr = def.args.map(a => `<${a}>`).join(' ');
      lines.push(`  ${PREFIX}${name} ${argStr} - ${def.description}`);
    }
    return lines.join('\n');
  }

  function getCommands() {
    return { ...COMMANDS };
  }

  return Object.freeze({
    parse,
    getHelpText,
    getCommands,
  });
}

export default createCommandParser;
