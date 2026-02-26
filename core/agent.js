// ClawCraft - Agent Orchestrator
// The brain: connects all layers and manages the agent lifecycle

import mineflayer from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import armorManager from 'mineflayer-armor-manager';
import autoEat from 'mineflayer-auto-eat';

import config from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getDatabase, initializeTables, closeDatabase } from '../utils/database.js';
import { createEventBus, EventCategory } from './event-bus.js';
import { createScheduler, TickGroup } from './scheduler.js';

// Layers
import { createSensors } from '../perception/sensors.js';
import { createWorldModel } from '../perception/world-model.js';
import { createEventClassifier } from '../perception/event-classifier.js';

import { createSurvivalInstinct } from '../instinct/survival.js';
import { createCombatInstinct } from '../instinct/combat.js';
import { createSelfPreservation } from '../instinct/self-preservation.js';

import { createWorkingMemory } from '../memory/working-memory.js';
import { createEpisodicMemory } from '../memory/episodic-memory.js';
import { createSemanticMemory } from '../memory/semantic-memory.js';
import { createSpatialMemory } from '../memory/spatial-memory.js';
import { createSocialMemory } from '../memory/social-memory.js';
import { createMemoryManager } from '../memory/memory-manager.js';

import { createGoalManager } from '../planning/goal-manager.js';
import { createTaskDecomposer } from '../planning/task-decomposer.js';
import { createTaskQueue } from '../planning/task-queue.js';
import { createPlanExecutor } from '../planning/plan-executor.js';

import { createLLMInterface } from '../consciousness/llm-interface.js';
import { createThinker } from '../consciousness/thinker.js';
import { createPromptBuilder } from '../consciousness/prompt-builder.js';
import { createReflection } from '../consciousness/reflection.js';

import { createPersonality } from '../soul/personality.js';
import { createEmotions } from '../soul/emotions.js';
import { createMotivations } from '../soul/motivations.js';
import { createFavorability } from '../soul/favorability.js';
import { createProficiency } from '../soul/proficiency.js';
import { createSchedule } from '../soul/schedule.js';

import { createMinecraftChat } from '../communication/minecraft-chat.js';
import { createDiscordBridge } from '../communication/discord-bridge.js';
import { createMessageFormatter } from '../communication/message-formatter.js';
import { createCommandParser } from '../communication/command-parser.js';

import { createMovement } from '../actions/movement.js';
import { createMining } from '../actions/mining.js';
import { createBuilding } from '../actions/building.js';
import { createCrafting } from '../actions/crafting.js';
import { createFarming } from '../actions/farming.js';
import { createInventoryManager } from '../actions/inventory.js';
import { createInteraction } from '../actions/interaction.js';
import { createFishing } from '../actions/fishing.js';
import { createSmelting } from '../actions/smelting.js';

import { createBehaviorManager } from './behavior-manager.js';
import { createGuardVillageBehavior } from '../behaviors/guard-village.js';
import { createReporter } from '../communication/reporter.js';

import { createDecisionTrees } from '../autonomy/decision-trees.js';
import { createProblemSolver } from '../autonomy/problem-solver.js';

import { createEventAccumulator } from '../communication/narrator/event-accumulator.js';
import { createPatternDetector } from '../communication/narrator/pattern-detector.js';
import { createTemplateNarrator } from '../communication/narrator/template-narrator.js';

import { createWelcomeBack } from '../communication/proactive/welcome-back.js';
import { createAlertTriggers } from '../communication/proactive/alert-triggers.js';

const log = createLogger('Agent');

export async function createAgent() {
  log.info(`Initializing ${config.agent.name}...`);

  // --- Foundation ---
  const bus = createEventBus();
  const scheduler = createScheduler(config.agent.tickRate);
  const db = getDatabase(config.memory.dbPath);
  initializeTables(db);

  // --- Connect to Minecraft ---
  log.info(`Connecting to ${config.minecraft.host}:${config.minecraft.port}...`);
  const bot = mineflayer.createBot({
    host: config.minecraft.host,
    port: config.minecraft.port,
    username: config.minecraft.username,
    version: config.minecraft.version,
    auth: config.minecraft.auth,
  });

  // Load mineflayer plugins
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(armorManager);
  bot.loadPlugin(autoEat);

  // Wait for spawn
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve);
    bot.once('error', reject);
    bot.once('kicked', (reason) => reject(new Error(`Kicked: ${reason}`)));
  });
  log.info(`Spawned in world at ${bot.entity.position}`);

  // --- Perception Layer ---
  const sensors = createSensors(bot, bus);
  const worldModel = createWorldModel(bot, bus);
  const eventClassifier = createEventClassifier(bus);

  // --- Instinct Layer ---
  const survivalInstinct = createSurvivalInstinct(bot, bus);
  const combatInstinct = createCombatInstinct(bot, bus);
  const selfPreservation = createSelfPreservation(bot, bus);

  // --- Memory Layer ---
  const workingMemory = createWorkingMemory(config.memory.workingMemorySize);
  const episodicMemory = createEpisodicMemory(db);
  const semanticMemory = createSemanticMemory(db);
  const spatialMemory = createSpatialMemory(db);
  const socialMemory = createSocialMemory(db);
  const memoryManager = createMemoryManager({
    working: workingMemory,
    episodic: episodicMemory,
    semantic: semanticMemory,
    spatial: spatialMemory,
    social: socialMemory,
  });

  // --- Soul Layer ---
  const personality = createPersonality();
  const emotions = createEmotions(bus);
  const motivations = createMotivations(bus);
  const favorability = createFavorability(bus, socialMemory);
  const proficiency = createProficiency(bus, db);
  const schedule = createSchedule(bus, personality);

  favorability.initialize();
  proficiency.initialize();
  schedule.initialize();

  // --- Communication Layer ---
  const messageFormatter = createMessageFormatter(personality);
  const commandParser = createCommandParser();
  const minecraftChat = createMinecraftChat(bot, bus, messageFormatter);
  const discordBridge = config.discord.enabled
    ? createDiscordBridge(bus, messageFormatter)
    : null;

  // --- Actions Layer ---
  const actions = Object.freeze({
    movement: createMovement(bot),
    mining: createMining(bot),
    building: createBuilding(bot),
    crafting: createCrafting(bot),
    farming: createFarming(bot),
    inventory: createInventoryManager(bot),
    interaction: createInteraction(bot),
    fishing: createFishing(bot),
    smelting: createSmelting(bot),
  });

  // --- Planning Layer ---
  const goalManager = createGoalManager(bus);
  const taskDecomposer = createTaskDecomposer(actions, semanticMemory);
  const taskQueue = createTaskQueue();
  const planExecutor = createPlanExecutor(actions, bus, taskQueue);

  // --- Consciousness Layer ---
  const llm = createLLMInterface(config.llm);
  const promptBuilder = createPromptBuilder(memoryManager, personality, emotions);
  const thinker = createThinker(llm, promptBuilder, bus, memoryManager);
  const reflection = createReflection(llm, memoryManager, personality, emotions);

  // --- Reporter ---
  const reporter = createReporter(bus, discordBridge);

  // --- Autonomy Layer ---
  const decisionTrees = createDecisionTrees(bus, memoryManager, emotions);
  const problemSolver = createProblemSolver(bus, actions, memoryManager);

  // --- Narrator System ---
  const eventAccumulator = createEventAccumulator(bus);
  const patternDetector = createPatternDetector();
  const narrator = createTemplateNarrator(bus, personality, eventAccumulator, patternDetector);
  narrator.initialize();

  // --- Proactive Communication ---
  const welcomeBack = createWelcomeBack(bus, socialMemory, favorability, narrator);
  const alertTriggers = createAlertTriggers(bus, reporter);
  welcomeBack.initialize();
  alertTriggers.initialize();

  // --- Behavior Manager (mission system) ---
  const behaviorManager = createBehaviorManager(bus, thinker, memoryManager, emotions);

  // Register behavior types
  const guardVillageBehavior = createGuardVillageBehavior({
    bot, bus, actions, sensors, worldModel, memoryManager, reporter, emotions,
  });
  behaviorManager.register('guard-village', guardVillageBehavior);

  // --- Register scheduler tasks ---
  scheduler.register('sensors', () => sensors.scan(), TickGroup.EVERY_TICK);
  scheduler.register('instincts', () => {
    survivalInstinct.evaluate();
    selfPreservation.evaluate();
    combatInstinct.evaluate();
  }, TickGroup.EVERY_TICK);

  scheduler.register('worldModel', () => worldModel.update(), TickGroup.FAST);
  scheduler.register('planExecution', () => planExecutor.tick(), TickGroup.MEDIUM);
  scheduler.register('behaviorTick', () => behaviorManager.tick(), TickGroup.MEDIUM);
  scheduler.register('motivations', () => motivations.update(), TickGroup.MEDIUM);

  scheduler.register('memoryConsolidation', () => {
    memoryManager.consolidate();
  }, TickGroup.SLOW);

  scheduler.register('thinking', () => {
    thinker.think();
  }, TickGroup.SLOW);

  scheduler.register('reflection', () => {
    reflection.reflect();
  }, TickGroup.VERY_SLOW);

  scheduler.register('favorabilityDecay', () => {
    favorability.applyAbsenceDecay();
  }, TickGroup.VERY_SLOW);

  // --- Wire up chat commands ---
  bus.on('chat:incoming', (event) => {
    const parsed = commandParser.parse(event.data.message, event.data.username);
    if (parsed) {
      bus.emit('command:received', parsed, EventCategory.COMMAND);
    }
  });

  // --- Command handler ---
  bus.on('command:received', (event) => {
    const cmd = event.data;

    switch (cmd.command) {
      case 'guard':
        // Start guard behavior via LLM mission planning
        behaviorManager.startFromInstruction({
          message: 'Guard and protect this area. Patrol, eliminate hostiles, repair damage, report status.',
          username: cmd.username,
        }, {
          nearbyLocations: worldModel.getSnapshot().pointsOfInterest,
          currentState: { health: bot.health, food: bot.food },
        });
        break;

      case 'stopguard':
        behaviorManager.stopCurrent('player_command');
        minecraftChat.send('Entendido. Dejo de vigilar.');
        break;

      case 'mission':
        const status = behaviorManager.getStatus();
        if (status.active) {
          minecraftChat.send(`Mision: ${status.active.name} (${status.active.state}, ${Math.round(status.active.duration / 60000)} min, ${status.active.stats.llmCalls} LLM calls)`);
        } else {
          minecraftChat.send('Sin mision activa.');
        }
        break;

      case 'report':
        reporter.sendRoutine(`Reporte manual - HP: ${bot.health}/20 | Food: ${bot.food}/20 | Pos: ${bot.entity.position}`);
        break;

      case 'master':
        if (cmd.args.name) {
          socialMemory.setMaster(cmd.args.name);
          minecraftChat.send(`${cmd.args.name} es mi nuevo maestro.`);
        } else {
          socialMemory.setMaster(cmd.username);
          minecraftChat.send(`${cmd.username}, ahora eres mi maestro.`);
        }
        break;

      case 'status':
        minecraftChat.send(messageFormatter.formatStatus({
          health: bot.health,
          food: bot.food,
          position: bot.entity.position,
          task: behaviorManager.getStatus().active?.name ?? 'ninguna',
        }));
        break;

      case 'stop':
        planExecutor.interrupt('player_command');
        behaviorManager.stopCurrent('player_command');
        actions.movement.stopMoving();
        minecraftChat.send('Parando todo.');
        break;

      case 'follow':
        const target = cmd.args.target ?? cmd.username;
        actions.movement.followPlayer(target).catch(err => {
          minecraftChat.send(`No puedo seguir a ${target}: ${err.message}`);
        });
        break;

      case 'come':
        const player = bot.players[cmd.username]?.entity;
        if (player) {
          actions.movement.goTo(player.position);
        } else {
          minecraftChat.send('No te veo cerca.');
        }
        break;

      case 'help':
        minecraftChat.send(commandParser.getHelpText());
        break;

      case 'mood':
        const mood = emotions.getCurrentState();
        minecraftChat.send(`Estado: ${mood.dominant} (intensidad: ${mood.intensity.toFixed(2)})`);
        break;

      case 'memory':
        const stats = memoryManager.getFullStats();
        minecraftChat.send(`Episodica: ${stats.episodic.totalMemories} | Semantica: ${stats.semantic.totalFacts} | Espacial: ${stats.spatial.totalLocations} | Social: ${stats.social.totalEntities}`);
        break;

      default:
        // Natural language or unknown command -> send to thinker
        if (cmd.type === 'natural') {
          // Natural language might be a mission instruction
          if (socialMemory.isTrusted(cmd.username)) {
            behaviorManager.startFromInstruction({
              message: cmd.content,
              username: cmd.username,
            }, {
              nearbyLocations: worldModel.getSnapshot().pointsOfInterest,
              currentState: { health: bot.health, food: bot.food },
            });
          } else {
            thinker.askQuestion(cmd.username, cmd.content ?? cmd.raw);
          }
        }
        break;
    }
  });

  // --- Forward unexpected events to behavior manager ---
  bus.on('behavior:unexpectedEvent', (event) => {
    behaviorManager.handleUnexpectedEvent(event);
  });

  // --- Handle bot events ---
  bot.on('death', () => {
    bus.emit('agent:death', {}, EventCategory.AGENT);
    log.warn('I died!');
  });

  bot.on('end', (reason) => {
    bus.emit('agent:disconnected', { reason }, EventCategory.AGENT);
    log.warn(`Disconnected: ${reason}`);
  });

  bot.on('error', (err) => {
    log.error(`Bot error: ${err.message}`);
  });

  // --- Public API ---
  const agent = Object.freeze({
    bot,
    bus,
    scheduler,
    actions,
    memory: memoryManager,
    soul: { personality, emotions, motivations, favorability, proficiency, schedule },
    autonomy: { decisionTrees, problemSolver },
    planning: { goalManager, taskDecomposer, taskQueue, planExecutor },
    consciousness: { llm, thinker, promptBuilder, reflection },
    communication: { minecraftChat, discordBridge, reporter, narrator, alertTriggers },
    behaviors: behaviorManager,

    async start() {
      log.info(`${config.agent.name} starting main loop...`);
      if (discordBridge) await discordBridge.connect();
      minecraftChat.send(`${config.agent.name} online. A tus ordenes.`);
      bus.emit('agent:started', {}, EventCategory.AGENT);
      await scheduler.start();
    },

    async shutdown() {
      log.info('Shutting down...');
      scheduler.stop();
      if (discordBridge) await discordBridge.disconnect();
      closeDatabase();
      bot.quit();
      bus.emit('agent:shutdown', {}, EventCategory.AGENT);
      log.info('Shutdown complete');
    },
  });

  return agent;
}

export default createAgent;
