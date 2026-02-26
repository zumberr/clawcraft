// ClawCraft - Template Narrator
// Converts accumulated events + detected patterns into natural language
// No LLM needed - uses template strings with personality flavor
// Outputs narration for: MC chat, Discord embeds, routine reports

import { createLogger } from '../../utils/logger.js';
import { EventCategory } from '../../core/event-bus.js';

const log = createLogger('Narrator:Template');

export function createTemplateNarrator(bus, personality, eventAccumulator, patternDetector) {

  function initialize() {
    eventAccumulator.configure({
      windowMs: 30000,
      onFlush: onAccumulatedEvents,
    });
    log.info('Template narrator initialized');
  }

  function onAccumulatedEvents(accumulated) {
    if (accumulated.totalEvents === 0) return;

    // Detect patterns
    const patterns = patternDetector.detect(accumulated);

    // Build narration
    const narration = buildNarration(accumulated, patterns);

    if (narration) {
      bus.emit('narrator:narration', {
        text: narration.text,
        discord: narration.discord,
        importance: narration.importance,
        patterns,
      }, EventCategory.AGENT);
    }
  }

  function buildNarration(accumulated, patterns) {
    const parts = [];
    let importance = 'low';

    // Narrate event summaries
    for (const summary of accumulated.summaries) {
      const text = narrateEventGroup(summary);
      if (text) parts.push(text);
    }

    // Narrate patterns (higher importance)
    for (const pattern of patterns) {
      const text = narratePattern(pattern);
      if (text) {
        parts.push(text);
        if (pattern.type === 'milestone' || pattern.type === 'escalation') {
          importance = 'high';
        } else if (importance === 'low') {
          importance = 'medium';
        }
      }
    }

    if (parts.length === 0) return null;

    const text = parts.join(' ');
    const discord = buildDiscordEmbed(accumulated, patterns, text);

    return { text, discord, importance };
  }

  function narrateEventGroup(summary) {
    const { type, count, data } = summary;
    const persona = personality.getPersona();
    const lang = persona.language ?? 'es';

    // Spanish templates (default)
    const templates = {
      hostile_killed: {
        1: () => `Elimine un ${data.name?.[0] ?? 'hostil'}.`,
        few: (n) => `Elimine ${n} hostiles.`,
        many: (n) => `Repeli una oleada de ${n} hostiles.`,
      },
      block_mined: {
        1: () => `Mine un bloque de ${data.block?.[0] ?? 'material'}.`,
        few: (n) => `Mine ${n} bloques.`,
        many: (n) => `Excave ${n} bloques de material.`,
      },
      block_placed: {
        1: () => `Coloque un bloque.`,
        few: (n) => `Coloque ${n} bloques.`,
        many: (n) => `Construi con ${n} bloques.`,
      },
      item_crafted: {
        1: () => `Fabrique ${data.item?.[0] ?? 'un objeto'}.`,
        few: (n) => `Fabrique ${n} objetos.`,
        many: (n) => `Sesion de crafteo: ${n} objetos.`,
      },
      crop_harvested: {
        1: () => `Coseche ${data.crop?.[0] ?? 'un cultivo'}.`,
        few: (n) => `Coseche ${n} cultivos.`,
        many: (n) => `Gran cosecha: ${n} cultivos recogidos.`,
      },
      damage_taken: {
        1: () => `Recibi un golpe.`,
        few: (n) => `Recibi ${n} impactos.`,
        many: (n) => `Batalla dura: recibi ${n} impactos.`,
      },
      player_seen: {
        1: () => `Vi a ${data.name?.[0] ?? 'un jugador'}.`,
        few: (n) => `Detecte ${n} jugadores en el area.`,
        many: (n) => `Zona concurrida: ${n} jugadores.`,
      },
      location_found: {
        1: () => `Descubri ${data.label?.[0] ?? 'un lugar nuevo'}.`,
        few: (n) => `Descubri ${n} nuevas ubicaciones.`,
        many: (n) => `Exploracion fructifera: ${n} descubrimientos.`,
      },
    };

    const template = templates[type];
    if (!template) return null;

    if (count === 1) return template[1]();
    if (count <= 5) return template.few(count);
    return template.many(count);
  }

  function narratePattern(pattern) {
    switch (pattern.type) {
      case 'streak':
        return `[Racha: ${pattern.count}x ${translateEvent(pattern.event)}]`;

      case 'milestone':
        return `[Hito alcanzado: ${pattern.threshold} ${translateEvent(pattern.event)}!]`;

      case 'anomaly':
        return `[Primera vez: ${translateEvent(pattern.event)}]`;

      case 'escalation':
        return `[Alerta: ${translateEvent(pattern.event)} en aumento]`;

      case 'contrast':
        return `[Cambio: de ${translateActivity(pattern.from)} a ${translateActivity(pattern.to)}]`;

      default:
        return null;
    }
  }

  function translateEvent(type) {
    const map = {
      hostile_killed: 'hostiles eliminados',
      block_mined: 'bloques minados',
      block_placed: 'bloques colocados',
      item_crafted: 'objetos fabricados',
      crop_harvested: 'cultivos cosechados',
      damage_taken: 'dano recibido',
      player_seen: 'jugadores vistos',
      location_found: 'lugares descubiertos',
    };
    return map[type] ?? type;
  }

  function translateActivity(activity) {
    const map = {
      mining: 'mineria',
      combat: 'combate',
      peaceful: 'paz',
      under_attack: 'bajo ataque',
      building: 'construccion',
      farming: 'agricultura',
    };
    return map[activity] ?? activity;
  }

  function buildDiscordEmbed(accumulated, patterns, text) {
    const hasMilestone = patterns.some(p => p.type === 'milestone');
    const hasEscalation = patterns.some(p => p.type === 'escalation');

    let color = 0x3498db; // Blue = normal
    if (hasEscalation) color = 0xe74c3c; // Red = escalation
    else if (hasMilestone) color = 0xf1c40f; // Gold = milestone

    const fields = accumulated.summaries.slice(0, 5).map(s => ({
      name: translateEvent(s.type),
      value: String(s.count),
      inline: true,
    }));

    return {
      title: hasMilestone ? 'Hito Alcanzado' : hasEscalation ? 'Situacion Critica' : 'Reporte de Actividad',
      description: text,
      color,
      fields,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate narration on demand (for routine reports)
   */
  function narrateNow() {
    const accumulated = eventAccumulator.flush();
    if (!accumulated) return null;

    const patterns = patternDetector.detect(accumulated);
    return buildNarration(accumulated, patterns);
  }

  return Object.freeze({
    initialize,
    narrateNow,
    narrateEventGroup,
    narratePattern,
    buildDiscordEmbed,
  });
}

export default createTemplateNarrator;
