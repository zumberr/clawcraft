// ClawCraft - Social Memory
// Relationships with players: trust, history, preferences (SQLite-backed)

import { createLogger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/helpers.js';
import { clamp } from '../utils/helpers.js';

const log = createLogger('Memory:Social');

export const Relationship = Object.freeze({
  MASTER: 'master',
  ALLY: 'ally',
  FRIEND: 'friend',
  NEUTRAL: 'neutral',
  WARY: 'wary',
  HOSTILE: 'hostile',
});

export function createSocialMemory(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO social_memory (entity_name, entity_type, trust_level, relationship, notes, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_name) DO UPDATE SET
      entity_type = excluded.entity_type,
      trust_level = excluded.trust_level,
      relationship = excluded.relationship,
      interactions_count = interactions_count + 1,
      last_interaction = datetime('now'),
      notes = excluded.notes,
      metadata = excluded.metadata
  `);

  const getStmt = db.prepare('SELECT * FROM social_memory WHERE entity_name = ?');
  const getAllStmt = db.prepare('SELECT * FROM social_memory ORDER BY trust_level DESC');

  const getByRelStmt = db.prepare(`
    SELECT * FROM social_memory WHERE relationship = ? ORDER BY trust_level DESC
  `);

  function remember(name, data = {}) {
    const existing = recall(name);
    const {
      entityType = existing?.entityType ?? 'player',
      trustLevel = existing?.trustLevel ?? 0.5,
      relationship = existing?.relationship ?? Relationship.NEUTRAL,
      notes = existing?.notes ?? '',
      metadata = existing?.metadata ?? {},
    } = data;

    try {
      upsertStmt.run(
        name,
        entityType,
        clamp(trustLevel, 0, 1),
        relationship,
        notes,
        JSON.stringify(metadata),
      );
      log.debug(`Updated social memory for ${name} (trust: ${trustLevel})`);
    } catch (err) {
      log.error(`Failed to remember ${name}: ${err.message}`);
    }
  }

  function recall(name) {
    const row = getStmt.get(name);
    if (!row) return null;
    return hydrateRow(row);
  }

  function recallAll() {
    return getAllStmt.all().map(hydrateRow);
  }

  function recallByRelationship(relationship) {
    return getByRelStmt.all(relationship).map(hydrateRow);
  }

  function getMaster() {
    const masters = recallByRelationship(Relationship.MASTER);
    return masters[0] ?? null;
  }

  function setMaster(name) {
    // Demote existing masters
    const currentMasters = recallByRelationship(Relationship.MASTER);
    for (const master of currentMasters) {
      if (master.name !== name) {
        remember(master.name, { relationship: Relationship.ALLY });
      }
    }

    remember(name, {
      trustLevel: 1.0,
      relationship: Relationship.MASTER,
      notes: 'My master',
    });

    log.info(`${name} is now my master`);
  }

  function adjustTrust(name, delta) {
    const existing = recall(name);
    if (!existing) {
      remember(name, { trustLevel: clamp(0.5 + delta, 0, 1) });
      return;
    }

    const newTrust = clamp(existing.trustLevel + delta, 0, 1);
    remember(name, { trustLevel: newTrust });

    // Auto-adjust relationship based on trust
    if (newTrust >= 0.8 && existing.relationship === Relationship.NEUTRAL) {
      remember(name, { relationship: Relationship.FRIEND });
    } else if (newTrust <= 0.2 && existing.relationship !== Relationship.HOSTILE) {
      remember(name, { relationship: Relationship.WARY });
    }
  }

  function getTrustLevel(name) {
    const entity = recall(name);
    return entity?.trustLevel ?? 0.5;
  }

  function isTrusted(name) {
    return getTrustLevel(name) >= 0.6;
  }

  function isMaster(name) {
    const entity = recall(name);
    return entity?.relationship === Relationship.MASTER;
  }

  function getStats() {
    const all = recallAll();
    const counts = {};
    for (const entity of all) {
      counts[entity.relationship] = (counts[entity.relationship] || 0) + 1;
    }
    return Object.freeze({
      totalEntities: all.length,
      byRelationship: counts,
    });
  }

  function hydrateRow(row) {
    return Object.freeze({
      name: row.entity_name,
      entityType: row.entity_type,
      trustLevel: row.trust_level,
      relationship: row.relationship,
      interactionsCount: row.interactions_count,
      lastInteraction: row.last_interaction,
      notes: row.notes,
      metadata: safeJsonParse(row.metadata, {}),
      firstMet: row.first_met,
    });
  }

  return Object.freeze({
    remember,
    recall,
    recallAll,
    recallByRelationship,
    getMaster,
    setMaster,
    adjustTrust,
    getTrustLevel,
    isTrusted,
    isMaster,
    getStats,
  });
}

export default createSocialMemory;
