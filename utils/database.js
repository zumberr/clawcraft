// ClawCraft - Database Wrapper
// SQLite wrapper using Bun's built-in SQLite or better-sqlite3 fallback

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Database } from 'bun:sqlite';
import { createLogger } from './logger.js';

const log = createLogger('Database');

let db = null;

export function getDatabase(dbPath) {
  if (db) return db;

  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent reads
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  log.info(`Database opened at ${dbPath}`);
  return db;
}

export function initializeTables(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS episodic_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      location_x REAL,
      location_y REAL,
      location_z REAL,
      importance REAL DEFAULT 0.5,
      emotional_valence REAL DEFAULT 0.0,
      actors TEXT, -- JSON array of involved entities
      metadata TEXT, -- JSON blob
      recalled_count INTEGER DEFAULT 0,
      last_recalled TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS semantic_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      source TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(category, key)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS spatial_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      z INTEGER NOT NULL,
      dimension TEXT DEFAULT 'overworld',
      block_type TEXT,
      structure_type TEXT,
      label TEXT,
      metadata TEXT,
      discovered_at TEXT DEFAULT (datetime('now')),
      UNIQUE(x, y, z, dimension)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS social_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_name TEXT NOT NULL UNIQUE,
      entity_type TEXT DEFAULT 'player',
      trust_level REAL DEFAULT 0.5,
      relationship TEXT DEFAULT 'neutral',
      interactions_count INTEGER DEFAULT 0,
      last_interaction TEXT,
      notes TEXT,
      first_met TEXT DEFAULT (datetime('now')),
      metadata TEXT
    )
  `);

  // Indexes for common queries
  database.run('CREATE INDEX IF NOT EXISTS idx_episodic_time ON episodic_memory(timestamp)');
  database.run('CREATE INDEX IF NOT EXISTS idx_episodic_type ON episodic_memory(event_type)');
  database.run('CREATE INDEX IF NOT EXISTS idx_episodic_importance ON episodic_memory(importance)');
  database.run('CREATE INDEX IF NOT EXISTS idx_spatial_pos ON spatial_memory(x, y, z)');
  database.run('CREATE INDEX IF NOT EXISTS idx_spatial_type ON spatial_memory(structure_type)');
  database.run('CREATE INDEX IF NOT EXISTS idx_semantic_cat ON semantic_memory(category)');

  log.info('Database tables initialized');
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}

export default { getDatabase, initializeTables, closeDatabase };
