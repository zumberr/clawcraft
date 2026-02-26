// ClawCraft - Semantic Memory
// Learned knowledge: crafting recipes, strategies, world facts (SQLite-backed)

import { createLogger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/helpers.js';

const log = createLogger('Memory:Semantic');

export function createSemanticMemory(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO semantic_memory (category, key, value, confidence, source)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(category, key) DO UPDATE SET
      value = excluded.value,
      confidence = excluded.confidence,
      source = excluded.source,
      updated_at = datetime('now')
  `);

  const getStmt = db.prepare(`
    SELECT * FROM semantic_memory WHERE category = ? AND key = ?
  `);

  const getByCategoryStmt = db.prepare(`
    SELECT * FROM semantic_memory WHERE category = ? ORDER BY key
  `);

  const searchStmt = db.prepare(`
    SELECT * FROM semantic_memory
    WHERE key LIKE ? OR value LIKE ?
    ORDER BY confidence DESC LIMIT ?
  `);

  function learn(category, key, value, confidence = 0.5, source = 'observation') {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      upsertStmt.run(category, key, valueStr, confidence, source);
      log.debug(`Learned: [${category}] ${key}`);
    } catch (err) {
      log.error(`Failed to learn: ${err.message}`);
    }
  }

  function recall(category, key) {
    const row = getStmt.get(category, key);
    if (!row) return null;

    return Object.freeze({
      category: row.category,
      key: row.key,
      value: safeJsonParse(row.value, row.value),
      confidence: row.confidence,
      source: row.source,
      updatedAt: row.updated_at,
    });
  }

  function recallCategory(category) {
    const rows = getByCategoryStmt.all(category);
    return rows.map(row => Object.freeze({
      key: row.key,
      value: safeJsonParse(row.value, row.value),
      confidence: row.confidence,
    }));
  }

  function search(query, limit = 10) {
    const pattern = `%${query}%`;
    const rows = searchStmt.all(pattern, pattern, limit);
    return rows.map(row => Object.freeze({
      category: row.category,
      key: row.key,
      value: safeJsonParse(row.value, row.value),
      confidence: row.confidence,
    }));
  }

  function knows(category, key) {
    const row = getStmt.get(category, key);
    return row !== undefined;
  }

  function forget(category, key) {
    db.prepare('DELETE FROM semantic_memory WHERE category = ? AND key = ?').run(category, key);
  }

  function getCategories() {
    const rows = db.prepare('SELECT DISTINCT category FROM semantic_memory ORDER BY category').all();
    return rows.map(r => r.category);
  }

  function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM semantic_memory').get();
    const byCategory = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM semantic_memory
      GROUP BY category ORDER BY count DESC
    `).all();

    return Object.freeze({
      totalFacts: total.count,
      byCategory,
    });
  }

  // Pre-load essential Minecraft knowledge
  function seedKnowledge() {
    const essentials = [
      ['crafting', 'wooden_pickaxe', '3 planks + 2 sticks', 0.99],
      ['crafting', 'stone_pickaxe', '3 cobblestone + 2 sticks', 0.99],
      ['crafting', 'iron_pickaxe', '3 iron_ingot + 2 sticks', 0.99],
      ['crafting', 'crafting_table', '4 planks in 2x2', 0.99],
      ['crafting', 'furnace', '8 cobblestone around border', 0.99],
      ['crafting', 'chest', '8 planks around border', 0.99],
      ['crafting', 'torch', '1 coal + 1 stick', 0.99],
      ['smelting', 'iron_ingot', 'iron_ore in furnace', 0.99],
      ['smelting', 'gold_ingot', 'gold_ore in furnace', 0.99],
      ['smelting', 'glass', 'sand in furnace', 0.99],
      ['strategy', 'first_day', 'Punch tree -> planks -> crafting table -> wooden pickaxe -> stone -> stone tools', 0.95],
      ['strategy', 'night_survival', 'Build shelter or dig into hillside before nightfall', 0.95],
      ['strategy', 'mining', 'Branch mine at Y=11 for diamonds, Y=-59 for 1.18+', 0.90],
      ['danger', 'creeper', 'Explodes near player. Keep distance, use bow or sprint-hit', 0.95],
      ['danger', 'enderman', 'Do not look at eyes. Wear pumpkin or avoid eye contact', 0.95],
      ['danger', 'lava', 'Found below Y=11 in overworld. Always carry water bucket', 0.95],
    ];

    for (const [category, key, value, confidence] of essentials) {
      if (!knows(category, key)) {
        learn(category, key, value, confidence, 'innate');
      }
    }

    log.info('Semantic knowledge seeded');
  }

  return Object.freeze({
    learn,
    recall,
    recallCategory,
    search,
    knows,
    forget,
    getCategories,
    getStats,
    seedKnowledge,
  });
}

export default createSemanticMemory;
