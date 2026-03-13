// ClawCraft - Alert Triggers
// Proactive notifications without being asked
// Sends alerts when important thresholds are crossed
// Cooldown-based to avoid spamming

import { createLogger } from "../../utils/logger.js";
import { EventCategory } from "../../core/event-bus.js";

const log = createLogger("Proactive:AlertTriggers");

const AlertType = Object.freeze({
  HEALTH_CRITICAL: "health_critical",
  FOOD_LOW: "food_low",
  TOOL_BREAKING: "tool_breaking",
  HOSTILE_WAVE: "hostile_wave",
  INVENTORY_FULL: "inventory_full",
  STRUCTURE_DAMAGE: "structure_damage",
  UNKNOWN_PLAYER: "unknown_player",
  NIGHT_APPROACHING: "night_approaching",
  DEATH: "death",
  MISSION_COMPLETE: "mission_complete",
  MILESTONE: "milestone",
});

// Cooldowns per alert type (ms) - prevent spam
const COOLDOWNS = Object.freeze({
  [AlertType.HEALTH_CRITICAL]: 60000, // 1 min
  [AlertType.FOOD_LOW]: 120000, // 2 min
  [AlertType.TOOL_BREAKING]: 300000, // 5 min
  [AlertType.HOSTILE_WAVE]: 30000, // 30s
  [AlertType.INVENTORY_FULL]: 300000, // 5 min
  [AlertType.STRUCTURE_DAMAGE]: 120000, // 2 min
  [AlertType.UNKNOWN_PLAYER]: 60000, // 1 min
  [AlertType.NIGHT_APPROACHING]: 600000, // 10 min
  [AlertType.DEATH]: 0, // Always alert
  [AlertType.MISSION_COMPLETE]: 0, // Always alert
  [AlertType.MILESTONE]: 0, // Always alert
});

export function createAlertTriggers(bus, reporter) {
  let lastAlertTimes = new Map(); // alertType -> timestamp
  let enabled = true;

  function initialize() {
    wireEvents();
    log.info("Alert triggers initialized");
  }

  function wireEvents() {
    bus.on("health:changed", (event) => {
      const health = event.data.health;
      if (health <= 4) {
        trigger(AlertType.HEALTH_CRITICAL, {
          message: `Salud critica: ${health}/20`,
          level: "emergency",
        });
      }
    });

    bus.on("food:changed", (event) => {
      const food = event.data.food;
      if (food <= 4) {
        trigger(AlertType.FOOD_LOW, {
          message: `Comida baja: ${food}/20`,
          level: "warning",
        });
      }
    });

    bus.on("entity:hostileNearby", (event) => {
      const count = event.data.count ?? 1;
      if (count >= 3) {
        trigger(AlertType.HOSTILE_WAVE, {
          message: `Oleada hostil: ${count} enemigos detectados`,
          level: "warning",
        });
      }
    });

    bus.on("inventory:full", () => {
      trigger(AlertType.INVENTORY_FULL, {
        message: "Inventario lleno",
        level: "warning",
      });
    });

    bus.on("agent:death", () => {
      trigger(AlertType.DEATH, {
        message: "He muerto!",
        level: "emergency",
      });
    });

    bus.on("behavior:completed", (event) => {
      trigger(AlertType.MISSION_COMPLETE, {
        message: `Mision completada: ${event.data.name ?? "mision"}`,
        level: "routine",
      });
    });

    bus.on("narrator:narration", (event) => {
      if (event.data.patterns?.some((p) => p.type === "milestone")) {
        trigger(AlertType.MILESTONE, {
          message: event.data.text,
          level: "routine",
        });
      }
    });

    bus.on("world:timeUpdate", (event) => {
      // Alert at dusk (time ~11500-12500)
      const time = (event.data.time ?? event.data.timeOfDay ?? 0) % 24000;
      if (time >= 11500 && time <= 12500) {
        trigger(AlertType.NIGHT_APPROACHING, {
          message: "La noche se acerca",
          level: "routine",
        });
      }
    });
  }

  function trigger(alertType, data) {
    if (!enabled) return;

    // Check cooldown
    const lastTime = lastAlertTimes.get(alertType) ?? 0;
    const cooldown = COOLDOWNS[alertType] ?? 60000;
    if (Date.now() - lastTime < cooldown) return;

    lastAlertTimes.set(alertType, Date.now());

    const { message, level } = data;

    log.info(`Alert [${level}]: ${message}`);

    // Route to appropriate channel
    switch (level) {
      case "emergency":
        reporter.sendEmergency(message);
        break;
      case "warning":
        reporter.sendWarning(message);
        break;
      case "routine":
      default:
        reporter.sendRoutine(message);
        break;
    }

    bus.emit(
      "alert:triggered",
      {
        type: alertType,
        message,
        level,
      },
      EventCategory.AGENT,
    );
  }

  function setEnabled(value) {
    enabled = value;
    log.info(`Alerts ${enabled ? "enabled" : "disabled"}`);
  }

  function clearCooldowns() {
    lastAlertTimes.clear();
  }

  return Object.freeze({
    initialize,
    trigger,
    setEnabled,
    clearCooldowns,
    AlertType,
  });
}

export default createAlertTriggers;
