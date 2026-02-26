// ClawCraft - Guard Village Behavior
// Full autonomous village protection:
//   PASO 4: Patrol + defend + repair + report (all without LLM)
//   PASO 6: Unknown player -> single LLM call to decide
//
// This is the flagship behavior that demonstrates the full cognitive pipeline.

import { createLogger } from '../utils/logger.js';
import { uid, distance3D, formatPos } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Behavior:GuardVillage');

// Timing constants (ms)
const PATROL_STEP_INTERVAL = 8000;      // Move to next patrol point every 8s
const STRUCTURE_SCAN_INTERVAL = 300000;  // Scan structures every 5 min
const ROUTINE_REPORT_INTERVAL = 600000;  // Routine report every 10 min
const HOSTILE_SCAN_RADIUS = 32;
const PATROL_RADIUS = 40;

export function createGuardVillageBehavior(deps) {
  const { bot, bus, actions, sensors, worldModel, memoryManager, reporter, emotions } = deps;

  /**
   * Factory: creates a guard-village handler instance for a specific plan
   */
  return function guardVillageFactory(plan, context = {}) {
    // --- State ---
    let patrolRoute = [];
    let patrolIndex = 0;
    let lastPatrolStep = 0;
    let lastStructureScan = 0;
    let lastRoutineReport = 0;
    let hostileKills = 0;
    let repairsCount = 0;
    let unknownPlayerEvents = [];
    let isPatrolling = true;
    let isRepairing = false;
    let isFighting = false;
    let villageCenterPos = null;
    let structureBlocks = new Map(); // position_key -> blockName (snapshot)
    let startTime = Date.now();

    // Initialize
    initialize(plan, context);

    function initialize(plan, context) {
      // Determine village center from spatial memory or current position
      const homePOI = worldModel.getNearestPOI('base');
      villageCenterPos = homePOI?.position ?? bot.entity.position;

      // Build patrol route around the village center
      patrolRoute = generatePatrolRoute(villageCenterPos, PATROL_RADIUS);
      log.info(`Guard initialized: center=${formatPos(villageCenterPos)}, patrol points=${patrolRoute.length}`);

      // Take initial structure snapshot
      takeStructureSnapshot();

      // Wire up combat events
      bus.on('entity:hostileNearby', onHostileDetected);
      bus.on('combat:ended', onCombatEnded);
      bus.on('entity:playerAppeared', onPlayerAppeared);
    }

    // ========== PASO 4: TICK (pure code, no LLM) ==========

    async function tick() {
      const now = Date.now();

      // Priority 1: Fighting (handled by instincts, we just track)
      if (isFighting) return null;

      // Priority 2: Repairing
      if (isRepairing) return null;

      // Priority 3: Patrol step
      if (isPatrolling && now - lastPatrolStep > PATROL_STEP_INTERVAL) {
        await doPatrolStep();
        lastPatrolStep = now;
      }

      // Priority 4: Structure scan (every 5 min)
      if (now - lastStructureScan > STRUCTURE_SCAN_INTERVAL) {
        await doStructureScan();
        lastStructureScan = now;
      }

      // Priority 5: Routine report (every 10 min)
      if (now - lastRoutineReport > ROUTINE_REPORT_INTERVAL) {
        doRoutineReport();
        lastRoutineReport = now;
      }

      return null;
    }

    // ========== PATROL ==========

    async function doPatrolStep() {
      if (patrolRoute.length === 0) return;

      const target = patrolRoute[patrolIndex];
      patrolIndex = (patrolIndex + 1) % patrolRoute.length;

      try {
        await actions.movement.goTo(target);
        log.debug(`Patrol point ${patrolIndex}/${patrolRoute.length}: ${formatPos(target)}`);

        // While moving, scan for hostiles
        const scan = sensors.scanEntities();
        if (scan.hostile.length > 0) {
          const closest = scan.hostile[0];
          if (closest.distance < HOSTILE_SCAN_RADIUS) {
            log.info(`Hostile detected during patrol: ${closest.name} at ${formatPos(closest.position)}`);
            bus.emit('entity:hostileNearby', closest, EventCategory.COMBAT);
          }
        }
      } catch (err) {
        log.debug(`Patrol step failed: ${err.message}`);
        // Skip this point, try next on next tick
      }
    }

    function generatePatrolRoute(center, radius) {
      // Generate a circular route with 8 waypoints
      const points = [];
      const numPoints = 8;

      for (let i = 0; i < numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y,
          z: center.z + Math.sin(angle) * radius,
        });
      }

      // Add center point as checkpoint
      points.splice(4, 0, { x: center.x, y: center.y, z: center.z });

      return points;
    }

    // ========== COMBAT (handled by instincts, we track stats) ==========

    function onHostileDetected(event) {
      const hostile = event.data;
      if (hostile.distance > HOSTILE_SCAN_RADIUS) return;

      isFighting = true;
      isPatrolling = false;
      log.info(`Engaging hostile: ${hostile.name} (${hostile.distance}m away)`);
    }

    function onCombatEnded(event) {
      isFighting = false;
      isPatrolling = true;

      if (event.data.reason === 'target_gone') {
        hostileKills++;
        log.info(`Hostile eliminated. Total kills this session: ${hostileKills}`);
      }

      // Resume patrol
      emotions.shift('determination', 0.05);
    }

    // ========== STRUCTURE SCANNING ==========

    function takeStructureSnapshot() {
      const center = villageCenterPos;
      const radius = 20;
      let blockCount = 0;

      for (let x = -radius; x <= radius; x += 2) {
        for (let y = -3; y <= 10; y += 2) {
          for (let z = -radius; z <= radius; z += 2) {
            const block = bot.blockAt(center.offset(x, y, z));
            if (block && block.name !== 'air' && block.name !== 'grass' && block.name !== 'dirt') {
              const key = `${Math.floor(center.x + x)},${Math.floor(center.y + y)},${Math.floor(center.z + z)}`;
              structureBlocks.set(key, block.name);
              blockCount++;
            }
          }
        }
      }

      log.info(`Structure snapshot: ${blockCount} blocks recorded`);
    }

    async function doStructureScan() {
      const center = villageCenterPos;
      const radius = 20;
      const damages = [];

      for (const [key, expectedBlock] of structureBlocks) {
        const [x, y, z] = key.split(',').map(Number);
        const current = bot.blockAt({ x, y, z });

        if (!current || current.name === 'air') {
          // Block is missing - potential damage
          damages.push({ position: { x, y, z }, expected: expectedBlock, actual: current?.name ?? 'air' });
        }
      }

      if (damages.length > 0) {
        log.warn(`Structure damage detected: ${damages.length} blocks`);

        // Try to repair (if we have the blocks)
        await repairDamages(damages);
      } else {
        log.debug('Structure scan: all clear');
      }
    }

    async function repairDamages(damages) {
      isRepairing = true;
      isPatrolling = false;
      let repaired = 0;

      for (const damage of damages.slice(0, 10)) { // Max 10 repairs per scan
        const hasBlock = actions.inventory.hasItem(damage.expected);
        if (!hasBlock) {
          // Try common substitutes
          const substitute = findSubstitute(damage.expected);
          if (!substitute) continue;
          damage.expected = substitute;
        }

        try {
          await actions.building.placeBlock(damage.expected, damage.position);
          repaired++;
          repairsCount++;
          log.debug(`Repaired ${damage.expected} at ${formatPos(damage.position)}`);
        } catch {
          // Can't repair this one
        }
      }

      if (repaired > 0) {
        log.info(`Repaired ${repaired}/${damages.length} blocks`);

        // Emergency report if significant damage
        if (damages.length > 5) {
          reporter.sendEmergency(
            `Dano detectado en la aldea: ${damages.length} bloques. Repare ${repaired}.`,
          );
        }
      }

      isRepairing = false;
      isPatrolling = true;
    }

    function findSubstitute(blockName) {
      const substitutes = {
        'oak_planks': ['spruce_planks', 'birch_planks', 'cobblestone'],
        'cobblestone': ['stone', 'deepslate'],
        'glass': ['glass_pane'],
        'oak_log': ['spruce_log', 'birch_log'],
      };

      const options = substitutes[blockName] ?? [];
      for (const sub of options) {
        if (actions.inventory.hasItem(sub)) return sub;
      }
      return null;
    }

    // ========== PASO 5: ROUTINE REPORTING (no LLM) ==========

    function doRoutineReport() {
      const elapsed = Math.round((Date.now() - startTime) / 60000);
      const report = buildRoutineReport(elapsed);

      reporter.sendRoutine(report);

      log.info(`Routine report sent (${elapsed} min elapsed)`);
    }

    function buildRoutineReport(elapsedMinutes) {
      const parts = [];

      // Status emoji
      const statusEmoji = hostileKills > 0 || repairsCount > 0 ? 'ALERTA' : 'OK';
      parts.push(`[${statusEmoji}] Reporte de guardia (${elapsedMinutes} min)`);

      // Combat summary
      if (hostileKills > 0) {
        parts.push(`Hostiles eliminados: ${hostileKills}`);
      } else {
        parts.push('Sin amenazas detectadas');
      }

      // Repairs
      if (repairsCount > 0) {
        parts.push(`Reparaciones: ${repairsCount} bloques`);
      }

      // Unknowns
      if (unknownPlayerEvents.length > 0) {
        parts.push(`Jugadores desconocidos vistos: ${unknownPlayerEvents.length}`);
      }

      parts.push(`Posicion: ${formatPos(bot.entity.position)}`);
      parts.push(`Salud: ${bot.health}/20 | Comida: ${bot.food}/20`);

      return parts.join('\n');
    }

    // ========== PASO 6: UNEXPECTED EVENTS ==========

    function onPlayerAppeared(event) {
      const player = event.data;
      const social = memoryManager.social.recall(player.name);

      if (social && (social.relationship === 'master' || social.relationship === 'ally' || social.relationship === 'friend')) {
        // Known friendly player - handle locally
        log.info(`Friendly player detected: ${player.name} (${social.relationship})`);
        bus.emit('chat:outgoing', {
          message: `Hola ${player.name}! Todo en orden por aqui.`,
        }, EventCategory.CHAT);
        return;
      }

      // Unknown player -> can't handle locally -> will trigger LLM call
      unknownPlayerEvents.push({
        name: player.name,
        position: player.position,
        timestamp: Date.now(),
      });

      log.info(`Unknown player detected: ${player.name} - escalating to LLM`);

      // Signal to behavior manager that this needs LLM
      bus.emit('behavior:unexpectedEvent', {
        type: 'unknown_player',
        player: player.name,
        position: player.position,
        context: `Unknown player "${player.name}" approached the village while I'm guarding it for ${memoryManager.social.getMaster()?.name ?? 'my master'}`,
      }, EventCategory.AGENT);
    }

    /**
     * Handle events that patrol logic can't resolve alone
     * Returns true if handled locally, false if LLM needed
     */
    function handleEvent(event) {
      const data = event.data;

      switch (event.name) {
        case 'health:damage':
          // Combat instincts handle this
          return true;

        case 'entity:hostileNearby':
          onHostileDetected(event);
          return true;

        case 'world:timeChange':
          // Night: tighten patrol, Day: relax
          if (!data.isDay) {
            log.info('Night falling - tightening patrol radius');
            patrolRoute = generatePatrolRoute(villageCenterPos, PATROL_RADIUS * 0.6);
          } else {
            patrolRoute = generatePatrolRoute(villageCenterPos, PATROL_RADIUS);
          }
          return true;

        case 'entity:playerAppeared':
          // Check if it's an unknown player - might need LLM
          const social = memoryManager.social.recall(data.name);
          if (social && social.trustLevel >= 0.5) return true;
          return false; // Unknown player -> needs LLM

        case 'agent:death':
          // We died - this is critical
          reporter.sendEmergency(`Mori mientras cuidaba la aldea! Posicion: ${formatPos(bot.entity.position)}`);
          return true;

        default:
          return true; // Handle everything else silently
      }
    }

    // ========== LIFECYCLE ==========

    function getSummary() {
      const elapsed = Math.round((Date.now() - startTime) / 60000);
      return {
        description: `Cuide la aldea por ${elapsed} min. ${hostileKills} hostiles eliminados, ${repairsCount} reparaciones.`,
        elapsedMinutes: elapsed,
        hostileKills,
        repairsCount,
        unknownPlayers: unknownPlayerEvents.length,
        patrolLaps: Math.floor(patrolIndex / patrolRoute.length),
      };
    }

    async function cleanup() {
      bus.off('entity:hostileNearby', onHostileDetected);
      bus.off('combat:ended', onCombatEnded);
      bus.off('entity:playerAppeared', onPlayerAppeared);

      actions.movement.stopMoving();
      log.info('Guard behavior cleaned up');
    }

    return Object.freeze({
      tick,
      handleEvent,
      getSummary,
      cleanup,
    });
  };
}

export default createGuardVillageBehavior;
