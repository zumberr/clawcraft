// ClawCraft - Tool Registry
// Exposes bot actions as structured tools for the LLM agentic loop.
// Each tool wraps an action module with description, parameter schema,
// execute (with error handling), and result formatting.

import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { formatPos } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';
import { loadPlugins } from '../utils/plugin-loader.js';

const log = createLogger('ToolRegistry');

export async function createToolRegistry(actions, sensors, worldModel, memoryManager, bus, options = {}) {
  const tools = new Map();
  const pluginsDir = options.pluginsDir ?? join(process.cwd(), 'tools');

  function register(name, tool) {
    tools.set(name, tool);
  }

  // --- Movement ---
  register('move', {
    description: 'Move to a position or find and go to a block type.',
    parameters: { target: 'block name (string) or {x,y,z} coordinates', maxDistance: 'optional search radius (default 64)' },
    async execute(params) {
      if (typeof params.target === 'string') {
        await actions.movement.goToBlock(params.target, params.maxDistance ?? 64);
        return { moved: true, target: params.target };
      }
      await actions.movement.goTo(params.target);
      return { moved: true, target: params.target };
    },
    formatResult(data) {
      const target = typeof data.target === 'string'
        ? data.target
        : formatPos(data.target);
      return `Moved successfully to ${target}.`;
    },
  });

  // --- Mining ---
  register('mine', {
    description: 'Mine/dig a specific block type. Returns number mined.',
    parameters: { block: 'block name (e.g. "oak_log", "stone")', count: 'how many to mine (default 1)' },
    async execute(params) {
      const mined = await actions.mining.mineBlock(params.block, params.count ?? 1);
      return { block: params.block, mined };
    },
    formatResult(data) {
      return `Mined ${data.mined} ${data.block}.`;
    },
  });

  // --- Crafting ---
  register('craft', {
    description: 'Craft an item. Bot will use a crafting table if needed.',
    parameters: { item: 'item name (e.g. "stick", "wooden_pickaxe")', count: 'how many (default 1)' },
    async execute(params) {
      const result = await actions.crafting.craft(params.item, params.count ?? 1);
      return { item: params.item, count: params.count ?? 1, result };
    },
    formatResult(data) {
      return `Crafted ${data.count} ${data.item}.`;
    },
  });

  // --- Building ---
  register('build', {
    description: 'Build a structure or place a single block.',
    parameters: { type: '"box"|"shelter"|"wall"|"tower"|"floor" OR block name for single placement', position: '{x,y,z} for single block', params: 'structure params (material, width, height, etc.)' },
    async execute(params) {
      if (params.position) {
        await actions.building.placeBlock(params.type, params.position, params.faceVector);
        return { placed: params.type, position: params.position };
      }
      await actions.building.buildStructure(params.type, params.params ?? {});
      return { built: params.type };
    },
    formatResult(data) {
      if (data.placed) return `Placed ${data.placed} at ${formatPos(data.position)}.`;
      return `Built structure: ${data.built}.`;
    },
  });

  // --- Farming ---
  register('farm', {
    description: 'Farm actions: harvest, plant, or harvestAndReplant crops.',
    parameters: { action: '"harvest"|"plant"|"harvestAndReplant"', crop: 'crop name (default "wheat")', radius: 'search radius (default 16)' },
    async execute(params) {
      const action = params.action ?? 'harvestAndReplant';
      const crop = params.crop ?? 'wheat';
      const radius = params.radius ?? 16;
      const fn = actions.farming[action];
      if (!fn) throw new Error(`Unknown farm action: ${action}`);
      const result = await fn(crop, radius);
      return { action, crop, result };
    },
    formatResult(data) {
      return `Farm ${data.action} completed for ${data.crop}.`;
    },
  });

  // --- Inventory management ---
  register('inventory', {
    description: 'Manage inventory: equip, toss, store in chest, take from chest.',
    parameters: { action: '"equip"|"toss"|"store"|"take"', item: 'item name', count: 'optional count', destination: 'optional equip slot (default "hand")' },
    async execute(params) {
      const { action, item, count, destination } = params;
      switch (action) {
        case 'equip':
          await actions.inventory.equip(item, destination ?? 'hand');
          return { action: 'equip', item };
        case 'toss':
          await actions.inventory.toss(item, count ?? null);
          return { action: 'toss', item, count };
        case 'store':
          await actions.inventory.storeInChest(item);
          return { action: 'store', item };
        case 'take':
          await actions.inventory.takeFromChest(item, count ?? null);
          return { action: 'take', item, count };
        default:
          throw new Error(`Unknown inventory action: ${action}`);
      }
    },
    formatResult(data) {
      return `Inventory ${data.action}: ${data.item}${data.count ? ` x${data.count}` : ''}.`;
    },
  });

  // --- Interaction ---
  register('interact', {
    description: 'Interact with blocks/entities or sleep in a bed.',
    parameters: { action: '"interact"|"sleep"|"openDoor"|"useItem"', target: 'block or entity name (for interact)' },
    async execute(params) {
      const action = params.action ?? 'interact';
      if (action === 'sleep') {
        await actions.interaction.sleep();
        return { action: 'sleep' };
      }
      if (action === 'openDoor') {
        await actions.interaction.openDoor();
        return { action: 'openDoor' };
      }
      if (action === 'useItem') {
        await actions.interaction.useItem();
        return { action: 'useItem' };
      }
      await actions.interaction.interactWithBlockType(params.target);
      return { action: 'interact', target: params.target };
    },
    formatResult(data) {
      if (data.target) return `Interacted with ${data.target}.`;
      return `Action: ${data.action} completed.`;
    },
  });

  // --- Fishing ---
  register('fish', {
    description: 'Find a water source and fish. Returns caught items.',
    parameters: { maxCasts: 'max fishing attempts (default 10)' },
    async execute(params) {
      const caught = await actions.fishing.findAndFish({ maxCasts: params.maxCasts ?? 10 });
      return { caught: caught ?? [] };
    },
    formatResult(data) {
      if (!data.caught || data.caught.length === 0) return 'Fished but caught nothing.';
      const items = data.caught.map(i => i.name ?? i.displayName ?? String(i));
      return `Caught: ${items.join(', ')}.`;
    },
  });

  // --- Smelting ---
  register('smelt', {
    description: 'Smelt items in a furnace (ores, food, etc.).',
    parameters: { item: 'input item name (e.g. "raw_iron")', count: 'how many (default 1)', fuel: 'fuel item (auto-detected if null)' },
    async execute(params) {
      const result = await actions.smelting.smelt(params.item, params.count ?? 1, params.fuel ?? null);
      return { item: params.item, count: params.count ?? 1, result };
    },
    formatResult(data) {
      return `Smelted ${data.count} ${data.item}.`;
    },
  });

  // --- Perception: look around ---
  register('look_around', {
    description: 'Scan surroundings: nearby entities (hostile, passive, players), environment info, points of interest.',
    parameters: {},
    async execute() {
      const entities = sensors.scanEntities();
      const env = sensors.scanEnvironment();
      const snapshot = worldModel.getSnapshot();
      return { entities, env, pois: snapshot.pointsOfInterest, biome: snapshot.biome };
    },
    formatResult(data) {
      const sections = [];
      const { hostile, passive, players } = data.entities;
      if (hostile.length > 0) sections.push(`Hostile: ${hostile.map(e => `${e.name} (${e.distance}m)`).join(', ')}`);
      if (passive.length > 0) sections.push(`Passive: ${passive.map(e => `${e.name} (${e.distance}m)`).join(', ')}`);
      if (players.length > 0) sections.push(`Players: ${players.map(e => `${e.name} (${e.distance}m)`).join(', ')}`);
      sections.push(`Position: ${formatPos(data.env.position)}, ${data.env.isDay ? 'Day' : 'Night'}, Biome: ${data.biome}`);
      if (data.pois.length > 0) sections.push(`POIs: ${data.pois.slice(0, 5).map(p => `${p.type} at (${p.position.x},${p.position.y},${p.position.z})`).join(', ')}`);
      return sections.join('\n');
    },
  });

  // --- Check inventory ---
  register('check_inventory', {
    description: 'Get a summary of current inventory contents.',
    parameters: {},
    async execute() {
      const summary = actions.inventory.getSummary();
      const items = actions.inventory.listItems();
      return { summary, items };
    },
    formatResult(data) {
      if (!data.items || data.items.length === 0) return 'Inventory is empty.';
      const lines = data.items.map(i => `${i.name} x${i.count}`);
      return `Inventory:\n${lines.join('\n')}`;
    },
  });

  // --- Recall memory ---
  register('recall_memory', {
    description: 'Search episodic memory for past experiences or recall nearby known locations.',
    parameters: { query: 'search term (optional)', type: '"recent"|"locations" (default "recent")', count: 'how many results (default 5)' },
    async execute(params) {
      const type = params.type ?? 'recent';
      const count = params.count ?? 5;
      if (type === 'locations') {
        const snapshot = worldModel.getSnapshot();
        return { type: 'locations', data: snapshot.pointsOfInterest.slice(0, count) };
      }
      const memories = memoryManager.episodic.recallRecent(count);
      return { type: 'recent', data: memories };
    },
    formatResult(data) {
      if (!data.data || data.data.length === 0) return 'No memories found.';
      if (data.type === 'locations') {
        return data.data.map(l => `${l.type} at (${l.position.x},${l.position.y},${l.position.z})`).join('\n');
      }
      return data.data.map(m => `- ${m.description}`).join('\n');
    },
  });

  // --- Say in chat ---
  register('say', {
    description: 'Send a message in Minecraft chat.',
    parameters: { message: 'text to say in chat' },
    async execute(params) {
      bus.emit('chat:outgoing', { message: params.message }, EventCategory.CHAT);
      return { said: params.message };
    },
    formatResult(data) {
      return `Said: "${data.said}"`;
    },
  });

  // --- Finish signal ---
  register('finish', {
    description: 'Signal that the task is complete. Use this when the goal is achieved.',
    parameters: { result: 'summary of what was accomplished' },
    async execute(params) {
      return { finished: true, result: params.result };
    },
    formatResult(data) {
      return `Task finished: ${data.result}`;
    },
  });

  // --- Public API ---

  async function execute(toolName, params) {
    const tool = tools.get(toolName);
    if (!tool) {
      log.warn(`Unknown tool requested: ${toolName}`);
      return { success: false, error: `Unknown tool: ${toolName}. Available: ${[...tools.keys()].join(', ')}` };
    }

    try {
      const result = await tool.execute(params ?? {});
      log.debug(`Tool ${toolName} executed successfully`);
      return { success: true, data: result };
    } catch (err) {
      log.warn(`Tool ${toolName} failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  function formatObservation(toolName, result) {
    if (!result.success) return `ERROR: ${result.error}`;
    const tool = tools.get(toolName);
    if (!tool) return JSON.stringify(result.data);
    return tool.formatResult(result.data);
  }

  function getTools() {
    const descriptions = [];
    for (const [name, tool] of tools) {
      descriptions.push({
        name,
        description: tool.description,
        parameters: tool.parameters,
      });
    }
    return descriptions;
  }

  // --- External Plugin Support ---

  const deps = Object.freeze({ actions, sensors, worldModel, memoryManager, bus, execute });

  function registerExternal(plugin) {
    if (tools.has(plugin.name)) {
      log.warn(`Plugin "${plugin.name}" conflicts with built-in tool, skipping`);
      return false;
    }

    if (plugin.type === 'skill') {
      // Wrap multi-step skill as a standard tool
      register(plugin.name, {
        description: plugin.description,
        parameters: plugin.parameters ?? {},
        async execute(params) {
          return await plugin.steps(params, deps);
        },
        formatResult: plugin.formatResult,
      });
    } else {
      // Standard tool plugin
      register(plugin.name, {
        description: plugin.description,
        parameters: plugin.parameters ?? {},
        async execute(params) {
          return await plugin.execute(params, deps);
        },
        formatResult: plugin.formatResult,
      });
    }

    return true;
  }

  // Auto-load plugins from tools/ directory
  const plugins = await loadPlugins(pluginsDir);
  for (const plugin of plugins) {
    registerExternal(plugin);
  }

  log.info(`Tool registry initialized with ${tools.size} tools (${plugins.length} from plugins)`);

  return Object.freeze({
    execute,
    formatObservation,
    getTools,
    registerExternal,
  });
}

export default createToolRegistry;
