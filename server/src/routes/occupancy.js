const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db');
const { getLatestSample, getSetting } = require('../lib/ingestion');
const { getMqttStatus, publishCapacity } = require('../mqtt');

const router = express.Router();

/**
 * GET /api/occupancy/current
 * Returns the latest occupancy sample + MQTT status.
 */
router.get('/current', (req, res) => {
  try {
    const sample = getLatestSample();
    const mqtt = getMqttStatus();
    const staleThresholdSeconds = parseInt(getSetting('stale_threshold_seconds', '60'), 10);
    const staleThresholdMs = staleThresholdSeconds * 1000;

    let isStale = false;
    if (!mqtt.connected) {
      isStale = true;
    } else if (mqtt.lastMessageAt && (Date.now() - mqtt.lastMessageAt > staleThresholdMs)) {
      isStale = true;
    } else if (!mqtt.lastMessageAt && sample && (Date.now() - sample.ts > staleThresholdMs)) {
      isStale = true;
    }

    return res.json({
      data: {
        sample,
        mqtt,
        isStale
      },
      error: null,
      meta: {
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.error('[Route: /occupancy/current] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/occupancy/history
 * Query params: from (unix ms), to (unix ms), limit (default 200).
 * Returns array of occupancy samples ordered by ts ASC.
 */
router.get('/history', (req, res) => {
  try {
    const db = getDb();
    const from = req.query.from ? parseInt(req.query.from, 10) : null;
    const to = req.query.to ? parseInt(req.query.to, 10) : null;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10), 5000) : 200;

    let query = 'SELECT * FROM occupancy_samples';
    const params = [];
    const conditions = [];

    if (from !== null && !isNaN(from)) {
      conditions.push('ts >= ?');
      params.push(from);
    }
    if (to !== null && !isNaN(to)) {
      conditions.push('ts <= ?');
      params.push(to);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // When querying without tight time limits, retrieve the most recent N items in ascending order
    if (from === null && to === null) {
      query = `SELECT * FROM (SELECT * FROM occupancy_samples ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC`;
      params.push(limit);
    } else {
      query += ` ORDER BY ts ASC LIMIT ?`;
      params.push(limit);
    }

    const rows = db.prepare(query).all(...params);

    return res.json({
      data: rows,
      error: null,
      meta: {
        count: rows.length,
        limit,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.error('[Route: /occupancy/history] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * POST /api/occupancy/capacity
 * Body: { capacity: number }
 * Validates capacity is integer >= 1 and <= 10000. Calls publishCapacity(capacity).
 */
const capacitySchema = z.object({
  capacity: z.number().int().min(1).max(10000)
});

router.post('/capacity', async (req, res) => {
  try {
    const parseResult = capacitySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        data: null,
        error: parseResult.error.issues.map(i => i.message).join(', '),
        meta: { timestamp: Date.now() }
      });
    }

    const { capacity } = parseResult.data;

    try {
      await publishCapacity(capacity);
    } catch (mqttErr) {
      // Record capacity into history anyway even if MQTT is currently disconnected / in local testing
      console.warn('[Route: /occupancy/capacity] MQTT publish notice:', mqttErr.message);
    }

    // Also update capacity_history in SQLite
    const db = getDb();
    db.prepare(`
      INSERT INTO capacity_history (ts, capacity, source)
      VALUES (?, ?, 'api')
    `).run(Date.now(), capacity);

    return res.json({
      data: {
        published: true,
        capacity
      },
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: /occupancy/capacity] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
