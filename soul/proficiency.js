// ClawCraft - Proficiency System
// Skills improve with practice, inspired by Touhou Little Maid's maid skills
// Each skill has XP, level (1-10), and affects action success/speed
// Levels: 1-2 novice, 3-4 apprentice, 5-6 journeyman, 7-8 expert, 9-10 master

import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/helpers.js';
import { EventCategory } from '../core/event-bus.js';

const log = createLogger('Soul:Proficiency');

const SKILLS = Object.freeze({
  COMBAT: 'combat',
  MINING: 'mining',
  BUILDING: 'building',
  FARMING: 'farming',
  CRAFTING: 'crafting',
  EXPLORATION: 'exploration',
  SOCIAL: 'social',
});

// XP required per level (cumulative thresholds)
const LEVEL_THRESHOLDS = Object.freeze([
  0, 10, 30, 60, 100, 160, 240, 350, 500, 700,
]);

const SKILL_TIERS = Object.freeze({
  NOVICE: { min: 1, max: 2, label: 'novice', speedMod: 1.0 },
  APPRENTICE: { min: 3, max: 4, label: 'apprentice', speedMod: 0.9 },
  JOURNEYMAN: { min: 5, max: 6, label: 'journeyman', speedMod: 0.8 },
  EXPERT: { min: 7, max: 8, label: 'expert', speedMod: 0.7 },
  MASTER: { min: 9, max: 10, label: 'master', speedMod: 0.6 },
});

// XP granted per action type
const XP_TABLE = Object.freeze({
  // Combat
  killed_hostile: 5,
  took_damage: 1,
  killed_boss: 20,
  survived_night: 3,

  // Mining
  mined_block: 1,
  mined_ore: 3,
  mined_diamond: 8,
  completed_tunnel: 5,

  // Building
  placed_block: 1,
  completed_structure: 10,
  repaired_block: 2,

  // Farming
  harvested_crop: 2,
  planted_crop: 1,
  bred_animal: 3,
  full_harvest_cycle: 5,

  // Crafting
  crafted_item: 2,
  crafted_tool: 3,
  smelted_item: 1,

  // Exploration
  discovered_location: 5,
  traveled_distance: 1, // per 100 blocks
  found_structure: 8,

  // Social
  completed_command: 2,
  conversation: 1,
  completed_mission: 5,
});

export function createProficiency(bus, db) {
  let skills = new Map(); // skillName -> { xp, level }

  function initialize() {
    ensureTable();
    loadFromDb();

    // Initialize missing skills
    for (const skill of Object.values(SKILLS)) {
      if (!skills.has(skill)) {
        skills.set(skill, { xp: 0, level: 1 });
      }
    }
  }

  function ensureTable() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS proficiency (
        skill TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  function loadFromDb() {
    const rows = db.prepare('SELECT skill, xp, level FROM proficiency').all();
    for (const row of rows) {
      skills.set(row.skill, { xp: row.xp, level: row.level });
    }
    log.info(`Loaded ${rows.length} skill profiles`);
  }

  function saveSkill(skillName) {
    const data = skills.get(skillName);
    if (!data) return;

    db.prepare(`
      INSERT INTO proficiency (skill, xp, level, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(skill) DO UPDATE SET xp = ?, level = ?, updated_at = datetime('now')
    `).run(skillName, data.xp, data.level, data.xp, data.level);
  }

  function addXp(skillName, action, multiplier = 1) {
    const xpGain = (XP_TABLE[action] ?? 1) * multiplier;
    const current = skills.get(skillName) ?? { xp: 0, level: 1 };

    const newXp = current.xp + xpGain;
    const newLevel = calculateLevel(newXp);
    const leveledUp = newLevel > current.level;

    skills.set(skillName, { xp: newXp, level: newLevel });
    saveSkill(skillName);

    if (leveledUp) {
      log.info(`LEVEL UP! ${skillName}: ${current.level} -> ${newLevel}`);
      bus.emit('proficiency:levelUp', {
        skill: skillName,
        oldLevel: current.level,
        newLevel,
        tier: getTierForLevel(newLevel),
      }, EventCategory.SOUL);
    }

    return { xpGain, newXp, newLevel, leveledUp };
  }

  function calculateLevel(xp) {
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i]) {
        level = i + 1;
        break;
      }
    }
    return clamp(level, 1, 10);
  }

  function getTierForLevel(level) {
    if (level >= SKILL_TIERS.MASTER.min) return SKILL_TIERS.MASTER;
    if (level >= SKILL_TIERS.EXPERT.min) return SKILL_TIERS.EXPERT;
    if (level >= SKILL_TIERS.JOURNEYMAN.min) return SKILL_TIERS.JOURNEYMAN;
    if (level >= SKILL_TIERS.APPRENTICE.min) return SKILL_TIERS.APPRENTICE;
    return SKILL_TIERS.NOVICE;
  }

  function getLevel(skillName) {
    return skills.get(skillName)?.level ?? 1;
  }

  function getXp(skillName) {
    return skills.get(skillName)?.xp ?? 0;
  }

  function getTier(skillName) {
    return getTierForLevel(getLevel(skillName));
  }

  function getSpeedModifier(skillName) {
    return getTier(skillName).speedMod;
  }

  function getSuccessBonus(skillName) {
    // Higher level = higher chance of success on difficult tasks
    const level = getLevel(skillName);
    return (level - 1) * 0.05; // 0% at level 1, 45% at level 10
  }

  function getXpToNextLevel(skillName) {
    const current = skills.get(skillName) ?? { xp: 0, level: 1 };
    if (current.level >= 10) return 0;
    return LEVEL_THRESHOLDS[current.level] - current.xp;
  }

  // Wire events to XP gains
  function wireEvents() {
    bus.on('combat:ended', (event) => {
      if (event.data.reason === 'target_gone') {
        addXp(SKILLS.COMBAT, 'killed_hostile');
      }
    });

    bus.on('health:damage', () => {
      addXp(SKILLS.COMBAT, 'took_damage');
    });

    bus.on('action:mined', (event) => {
      const block = event.data.blockName ?? '';
      if (block.includes('diamond')) {
        addXp(SKILLS.MINING, 'mined_diamond');
      } else if (block.includes('ore')) {
        addXp(SKILLS.MINING, 'mined_ore');
      } else {
        addXp(SKILLS.MINING, 'mined_block');
      }
    });

    bus.on('action:placed', () => {
      addXp(SKILLS.BUILDING, 'placed_block');
    });

    bus.on('action:crafted', () => {
      addXp(SKILLS.CRAFTING, 'crafted_item');
    });

    bus.on('action:harvested', () => {
      addXp(SKILLS.FARMING, 'harvested_crop');
    });

    bus.on('action:planted', () => {
      addXp(SKILLS.FARMING, 'planted_crop');
    });

    bus.on('spatial:discovered', () => {
      addXp(SKILLS.EXPLORATION, 'discovered_location');
    });

    bus.on('command:received', () => {
      addXp(SKILLS.SOCIAL, 'completed_command');
    });

    bus.on('task:completed', () => {
      addXp(SKILLS.SOCIAL, 'completed_mission');
    });
  }

  wireEvents();

  function getStatus() {
    const result = {};
    for (const [name, data] of skills) {
      const tier = getTierForLevel(data.level);
      result[name] = {
        level: data.level,
        xp: data.xp,
        tier: tier.label,
        xpToNext: getXpToNextLevel(name),
        speedMod: tier.speedMod,
      };
    }
    return Object.freeze(result);
  }

  return Object.freeze({
    initialize,
    addXp,
    getLevel,
    getXp,
    getTier,
    getSpeedModifier,
    getSuccessBonus,
    getXpToNextLevel,
    getStatus,
    SKILLS,
  });
}

export default createProficiency;
