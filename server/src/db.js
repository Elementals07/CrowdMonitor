const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let dbInstance = null;

/**
 * Returns the singleton better-sqlite3 database instance.
 * Automatically initializes directory, schema, indices, and default settings on first run.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'occupancy.db');
  dbInstance = new Database(dbPath);

  // Enable WAL mode for better concurrency and performance
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Run initial migrations / schema setup
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS occupancy_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      occupancy INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      available INTEGER NOT NULL,
      percentage INTEGER NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'mqtt'
    );
    CREATE INDEX IF NOT EXISTS idx_samples_ts ON occupancy_samples(ts);

    CREATE TABLE IF NOT EXISTS entry_exit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'snapshot_delta'
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON entry_exit_events(ts);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'idle',
      started_at INTEGER,
      ended_at INTEGER,
      capacity_at_start INTEGER,
      capacity_at_end INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      ts_start INTEGER NOT NULL,
      ts_end INTEGER,
      occupancy INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      threshold_pct INTEGER NOT NULL,
      acknowledged_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts_start);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capacity_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cap_history_ts ON capacity_history(ts);

    CREATE TABLE IF NOT EXISTS connection_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      event TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conn_ts ON connection_events(ts);

    CREATE TABLE IF NOT EXISTS sensors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      location TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Ensure default prototype sensor exists in sensors table
  const sensorCount = dbInstance.prepare('SELECT COUNT(*) as count FROM sensors').get();
  if (sensorCount.count === 0) {
    dbInstance.prepare(`
      INSERT INTO sensors (code, name, location, created_at)
      VALUES (?, ?, ?, ?)
    `).run('ROOM-101', 'Main Conference Hall', 'Ground Floor - Main Gate', Date.now());
    console.log('[Database] Seeded default sensor ROOM-101');
  }

  // Initialize default settings if settings table is empty
  const countRow = dbInstance.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (countRow.count === 0) {
    const defaultSettings = [
      { key: 'warning_threshold_pct', value: '80' },
      { key: 'critical_threshold_pct', value: '100' },
      { key: 'facility_timezone', value: 'Asia/Kolkata' },
      { key: 'stale_threshold_seconds', value: '60' },
      { key: 'default_capacity', value: '10' },
      { key: 'primary_sensor_code', value: 'ROOM-101' },
      { key: 'admin_password', value: 'admin123' }
    ];

    const insertSetting = dbInstance.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    `);

    const now = Date.now();
    const insertMany = dbInstance.transaction((settingsList) => {
      for (const setting of settingsList) {
        insertSetting.run(setting.key, setting.value, now);
      }
    });

    insertMany(defaultSettings);
    console.log('[Database] Initialized default settings into database.');
  }

  console.log(`[Database] SQLite connected at ${dbPath}`);
  return dbInstance;
}

module.exports = {
  getDb
};
