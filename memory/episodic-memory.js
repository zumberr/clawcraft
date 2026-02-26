// ClawCraft - Episodic Memory
// Long-term storage of experiences, events, and stories (SQLite-backed)

import { createLogger } from '../utils/logger.js';

const log = createLogger('Memory:Episodic');

export function createEpisodicMemory(db) {
  const insertStmt = db.prepare(`
    INSERT INTO episodic_memory
    (timestamp, event_type, description, location_x, location_y, location_z, importance, emotional_valence, actors, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const queryByTypeStmt = db.prepare(`
    SELECT * FROM episodic_memory WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?
  `);

  const queryRecentStmt = db.prepare(`
    SELECT * FROM episodic_memory ORDER BY timestamp DESC LIMIT ?
  `);

  const queryImportantStmt = db.prepare(`
    SELECT * FROM episodic_memory WHERE importance >= ? ORDER BY importance DESC, timestamp DESC LIMIT ?
  `);

  const queryByActorStmt = db.prepare(`
    SELECT * FROM episodic_memory WHERE actors LIKE ? ORDER BY timestamp DESC LIMIT ?
  `);

  const queryNearStmt = db.prepare(`
    SELECT *,
      ((location_x - ?) * (location_x - ?) + (location_y - ?) * (location_y - ?) + (location_z - ?) * (location_z - ?)) as dist_sq
    FROM episodic_memory
    WHERE location_x IS NOT NULL
    ORDER BY dist_sq ASC
    LIMIT ?
  `);

  const updateRecalledStmt = db.prepare(`
    UPDATE episodic_memory
    SET recalled_count = recalled_count + 1, last_recalled = datetime('now')
    WHERE id = ?
  `);

  function record(event) {
    const {
      type,
      description,
      position = null,
      importance = 0.5,
      emotionalValence = 0.0,
      actors = [],
      metadata = {},
    } = event;

    try {
      insertStmt.run(
        new Date().toISOString(),
        type,
        description,
        position?.x ?? null,
        position?.y ?? null,
        position?.z ?? null,
        importance,
        emotionalValence,
        JSON.stringify(actors),
        JSON.stringify(metadata),
      );
      log.debug(`Recorded: [${type}] ${description}`);
    } catch (err) {
      log.error(`Failed to record episodic memory: ${err.message}`);
    }
  }

  function recallByType(eventType, limit = 10) {
    const rows = queryByTypeStmt.all(eventType, limit);
    return rows.map(hydrateRow);
  }

  function recallRecent(limit = 20) {
    const rows = queryRecentStmt.all(limit);
    return rows.map(hydrateRow);
  }

  function recallImportant(minImportance = 0.7, limit = 10) {
    const rows = queryImportantStmt.all(minImportance, limit);
    return rows.map(hydrateRow);
  }

  function recallAbout(actorName, limit = 10) {
    const rows = queryByActorStmt.all(`%${actorName}%`, limit);
    return rows.map(hydrateRow);
  }

  function recallNear(position, limit = 10) {
    const rows = queryNearStmt.all(
      position.x, position.x,
      position.y, position.y,
      position.z, position.z,
      limit,
    );
    return rows.map(hydrateRow);
  }

  function markRecalled(id) {
    updateRecalledStmt.run(id);
  }

  function search(query, limit = 10) {
    const stmt = db.prepare(`
      SELECT * FROM episodic_memory
      WHERE description LIKE ? OR event_type LIKE ?
      ORDER BY timestamp DESC LIMIT ?
    `);
    const pattern = `%${query}%`;
    return stmt.all(pattern, pattern, limit).map(hydrateRow);
  }

  function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM episodic_memory').get();
    const byType = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM episodic_memory
      GROUP BY event_type
      ORDER BY count DESC LIMIT 10
    `).all();

    return Object.freeze({
      totalMemories: total.count,
      byType,
    });
  }

  function hydrateRow(row) {
    return Object.freeze({
      id: row.id,
      timestamp: row.timestamp,
      type: row.event_type,
      description: row.description,
      position: row.location_x !== null ? {
        x: row.location_x,
        y: row.location_y,
        z: row.location_z,
      } : null,
      importance: row.importance,
      emotionalValence: row.emotional_valence,
      actors: JSON.parse(row.actors || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      recalledCount: row.recalled_count,
      lastRecalled: row.last_recalled,
    });
  }

  return Object.freeze({
    record,
    recallByType,
    recallRecent,
    recallImportant,
    recallAbout,
    recallNear,
    markRecalled,
    search,
    getStats,
  });
}

export default createEpisodicMemory;
