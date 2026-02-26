// ClawCraft - Spatial Memory
// Map of the world: known locations, structures, resource veins (SQLite-backed)

import { createLogger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/helpers.js';

const log = createLogger('Memory:Spatial');

export function createSpatialMemory(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO spatial_memory (x, y, z, dimension, block_type, structure_type, label, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(x, y, z, dimension) DO UPDATE SET
      block_type = excluded.block_type,
      structure_type = excluded.structure_type,
      label = excluded.label,
      metadata = excluded.metadata
  `);

  const getNearStmt = db.prepare(`
    SELECT *,
      ((x - ?) * (x - ?) + (y - ?) * (y - ?) + (z - ?) * (z - ?)) as dist_sq
    FROM spatial_memory
    WHERE dimension = ?
    ORDER BY dist_sq ASC
    LIMIT ?
  `);

  const getByTypeStmt = db.prepare(`
    SELECT * FROM spatial_memory
    WHERE structure_type = ? AND dimension = ?
    ORDER BY discovered_at DESC LIMIT ?
  `);

  const getByLabelStmt = db.prepare(`
    SELECT * FROM spatial_memory
    WHERE label LIKE ? AND dimension = ?
    ORDER BY discovered_at DESC LIMIT ?
  `);

  function remember(position, data = {}) {
    const {
      blockType = null,
      structureType = null,
      label = null,
      dimension = 'overworld',
      metadata = {},
    } = data;

    try {
      upsertStmt.run(
        Math.floor(position.x),
        Math.floor(position.y),
        Math.floor(position.z),
        dimension,
        blockType,
        structureType,
        label,
        JSON.stringify(metadata),
      );
    } catch (err) {
      log.error(`Failed to remember location: ${err.message}`);
    }
  }

  function recallNear(position, dimension = 'overworld', limit = 20) {
    const rows = getNearStmt.all(
      position.x, position.x,
      position.y, position.y,
      position.z, position.z,
      dimension,
      limit,
    );
    return rows.map(hydrateRow);
  }

  function recallByType(structureType, dimension = 'overworld', limit = 10) {
    return getByTypeStmt.all(structureType, dimension, limit).map(hydrateRow);
  }

  function recallByLabel(label, dimension = 'overworld', limit = 10) {
    return getByLabelStmt.all(`%${label}%`, dimension, limit).map(hydrateRow);
  }

  function findNearest(structureType, fromPos, dimension = 'overworld') {
    const results = recallByType(structureType, dimension, 50);
    if (results.length === 0) return null;

    return results.reduce((nearest, loc) => {
      const dist = Math.sqrt(
        (loc.x - fromPos.x) ** 2 +
        (loc.y - fromPos.y) ** 2 +
        (loc.z - fromPos.z) ** 2,
      );
      const nearestDist = nearest
        ? Math.sqrt(
            (nearest.x - fromPos.x) ** 2 +
            (nearest.y - fromPos.y) ** 2 +
            (nearest.z - fromPos.z) ** 2,
          )
        : Infinity;
      return dist < nearestDist ? loc : nearest;
    }, null);
  }

  function forget(position, dimension = 'overworld') {
    db.prepare(`
      DELETE FROM spatial_memory
      WHERE x = ? AND y = ? AND z = ? AND dimension = ?
    `).run(
      Math.floor(position.x),
      Math.floor(position.y),
      Math.floor(position.z),
      dimension,
    );
  }

  function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM spatial_memory').get();
    const byType = db.prepare(`
      SELECT structure_type, COUNT(*) as count
      FROM spatial_memory
      WHERE structure_type IS NOT NULL
      GROUP BY structure_type ORDER BY count DESC
    `).all();

    return Object.freeze({ totalLocations: total.count, byType });
  }

  function hydrateRow(row) {
    return Object.freeze({
      x: row.x,
      y: row.y,
      z: row.z,
      dimension: row.dimension,
      blockType: row.block_type,
      structureType: row.structure_type,
      label: row.label,
      metadata: safeJsonParse(row.metadata, {}),
      discoveredAt: row.discovered_at,
    });
  }

  return Object.freeze({
    remember,
    recallNear,
    recallByType,
    recallByLabel,
    findNearest,
    forget,
    getStats,
  });
}

export default createSpatialMemory;
