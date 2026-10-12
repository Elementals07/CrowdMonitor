const { z } = require('zod');
const { getDb } = require('../db');
const { broadcast } = require('./events');

// Zod schema for ESP8266 occupancy payload validation
const occupancySchema = z.object({
  occupancy: z.number().int().min(0),
  capacity: z.number().int().min(1),
  available: z.number().int(),
  percentage: z.number().int().min(0),
  status: z.enum(['NORMAL', 'FULL', 'OVERLIMIT'])
});

/**
 * Returns the most recent row from occupancy_samples or null.
 * @returns {object|null}
 */
function getLatestSample() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM occupancy_samples ORDER BY id DESC LIMIT 1').get();
  return row || null;
}

/**
 * Returns all active alerts where ts_end IS NULL.
 * @returns {Array<object>}
 */
function getOpenAlerts() {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE ts_end IS NULL ORDER BY ts_start DESC').all();
}

/**
 * Helper to fetch a setting value by key.
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
function getSetting(key, defaultValue) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

/**
 * Processes an incoming MQTT occupancy message snapshot.
 * @param {string|Buffer} rawPayload
 * @param {boolean} isRetained
 * @returns {object|null}
 */
function processOccupancyMessage(rawPayload, isRetained) {
  let parsedJson;
  try {
    parsedJson = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : JSON.parse(rawPayload.toString());
  } catch (err) {
    console.warn('[Ingestion] Failed to parse occupancy JSON payload:', err.message);
    return null;
  }

  const parseResult = occupancySchema.safeParse(parsedJson);
  if (!parseResult.success) {
    console.warn('[Ingestion] Occupancy payload validation failed:', parseResult.error.issues);
    return null;
  }

  const sample = parseResult.data;
  const now = Date.now();
  const db = getDb();

  // Get previous sample before inserting new one
  const previousSample = getLatestSample();

  const source = isRetained ? 'retained' : 'mqtt';

  // Perform database updates inside a synchronous transaction
  const transaction = db.transaction(() => {
    // 1. Insert sample
    const insertSampleStmt = db.prepare(`
      INSERT INTO occupancy_samples (ts, occupancy, capacity, available, percentage, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInfo = insertSampleStmt.run(
      now,
      sample.occupancy,
      sample.capacity,
      sample.available,
      sample.percentage,
      sample.status,
      source
    );
    const sampleId = Number(insertInfo.lastInsertRowid);

    // 2. If NOT retained, derive entry/exit deltas
    if (!isRetained && previousSample) {
      const delta = sample.occupancy - previousSample.occupancy;
      if (delta > 0) {
        db.prepare(`
          INSERT INTO entry_exit_events (ts, type, count, source)
          VALUES (?, 'delta_entry', ?, 'snapshot_delta')
        `).run(now, delta);
      } else if (delta < 0) {
        db.prepare(`
          INSERT INTO entry_exit_events (ts, type, count, source)
          VALUES (?, 'delta_exit', ?, 'snapshot_delta')
        `).run(now, Math.abs(delta));
      }
    }

    // 3. Track capacity changes
    if (previousSample && previousSample.capacity !== sample.capacity) {
      db.prepare(`
        INSERT INTO capacity_history (ts, capacity, source)
        VALUES (?, ?, ?)
      `).run(now, sample.capacity, source);
      console.log(`[Ingestion] Capacity change recorded: ${previousSample.capacity} -> ${sample.capacity}`);
    } else if (!previousSample) {
      // Record initial baseline capacity
      db.prepare(`
        INSERT INTO capacity_history (ts, capacity, source)
        VALUES (?, ?, ?)
      `).run(now, sample.capacity, source);
    }

    // 4. Alert thresholds logic
    const warningThreshold = parseInt(getSetting('warning_threshold_pct', '80'), 10);
    const criticalThreshold = parseInt(getSetting('critical_threshold_pct', '100'), 10);

    const openWarningAlert = db.prepare(`
      SELECT * FROM alerts WHERE type = 'warning' AND ts_end IS NULL LIMIT 1
    `).get();

    const openCriticalAlert = db.prepare(`
      SELECT * FROM alerts WHERE type = 'critical' AND ts_end IS NULL LIMIT 1
    `).get();

    if (sample.percentage >= criticalThreshold) {
      // Critical condition met
      // If critical is open, do not duplicate.
      // If warning was open, close it since status escalated to critical
      if (openWarningAlert) {
        db.prepare('UPDATE alerts SET ts_end = ? WHERE id = ?').run(now, openWarningAlert.id);
      }
      if (!openCriticalAlert) {
        db.prepare(`
          INSERT INTO alerts (type, ts_start, ts_end, occupancy, capacity, threshold_pct, acknowledged_at)
          VALUES ('critical', ?, NULL, ?, ?, ?, NULL)
        `).run(now, sample.occupancy, sample.capacity, criticalThreshold);
        console.log(`[Ingestion] Opened CRITICAL alert at ${sample.percentage}% (occupancy: ${sample.occupancy}/${sample.capacity})`);
      }
    } else if (sample.percentage >= warningThreshold) {
      // Warning condition met
      // If critical was open, close it (de-escalated to warning)
      if (openCriticalAlert) {
        db.prepare('UPDATE alerts SET ts_end = ? WHERE id = ?').run(now, openCriticalAlert.id);
      }
      if (!openWarningAlert) {
        db.prepare(`
          INSERT INTO alerts (type, ts_start, ts_end, occupancy, capacity, threshold_pct, acknowledged_at)
          VALUES ('warning', ?, NULL, ?, ?, ?, NULL)
        `).run(now, sample.occupancy, sample.capacity, warningThreshold);
        console.log(`[Ingestion] Opened WARNING alert at ${sample.percentage}% (occupancy: ${sample.occupancy}/${sample.capacity})`);
      }
    } else {
      // Below warning threshold - close any open alerts
      if (openWarningAlert) {
        db.prepare('UPDATE alerts SET ts_end = ? WHERE id = ?').run(now, openWarningAlert.id);
        console.log(`[Ingestion] Closed WARNING alert (occupancy normal at ${sample.percentage}%)`);
      }
      if (openCriticalAlert) {
        db.prepare('UPDATE alerts SET ts_end = ? WHERE id = ?').run(now, openCriticalAlert.id);
        console.log(`[Ingestion] Closed CRITICAL alert (occupancy normal at ${sample.percentage}%)`);
      }
    }

    return {
      id: sampleId,
      ts: now,
      occupancy: sample.occupancy,
      capacity: sample.capacity,
      available: sample.available,
      percentage: sample.percentage,
      status: sample.status,
      source
    };
  });

  const persistedSample = transaction();

  // Broadcast occupancy update to all connected Socket.IO clients
  broadcast('occupancy:update', persistedSample);
  return persistedSample;
}

/**
 * Processes dedicated entry/exit event topics (crowd/entry, crowd/exit).
 * @param {'entry'|'exit'} type
 * @param {string|Buffer} rawPayload
 * @returns {object|null}
 */
function processDedicatedEvent(type, rawPayload) {
  const db = getDb();
  let count = 1;
  const str = rawPayload ? rawPayload.toString().trim() : '';

  if (str) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'number') {
        count = parsed;
      } else if (parsed && typeof parsed.count === 'number') {
        count = parsed.count;
      }
    } catch {
      const intVal = parseInt(str, 10);
      if (!isNaN(intVal) && intVal > 0) {
        count = intVal;
      }
    }
  }

  const now = Date.now();
  const eventType = type === 'entry' ? 'entry' : 'exit';

  const insertStmt = db.prepare(`
    INSERT INTO entry_exit_events (ts, type, count, source)
    VALUES (?, ?, ?, 'event_topic')
  `);
  const result = insertStmt.run(now, eventType, count);

  const eventRecord = {
    id: Number(result.lastInsertRowid),
    ts: now,
    type: eventType,
    count,
    source: 'event_topic'
  };

  broadcast('event:new', eventRecord);
  console.log(`[Ingestion] Dedicated event recorded: ${eventType} (+${count})`);
  return eventRecord;
}

module.exports = {
  processOccupancyMessage,
  processDedicatedEvent,
  getLatestSample,
  getOpenAlerts,
  getSetting
};
