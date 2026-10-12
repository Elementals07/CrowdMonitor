const express = require('express');
const { getDb } = require('../db');
const { getOpenAlerts } = require('../lib/ingestion');

const router = express.Router();

/**
 * GET /api/alerts
 * Query params: from, to, type, open (boolean string, e.g. "true" or "false")
 * Returns filtered alerts.
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const from = req.query.from ? parseInt(req.query.from, 10) : null;
    const to = req.query.to ? parseInt(req.query.to, 10) : null;
    const type = req.query.type ? String(req.query.type).trim() : null;
    const open = req.query.open;

    const conditions = [];
    const params = [];

    if (from !== null && !isNaN(from)) {
      conditions.push('ts_start >= ?');
      params.push(from);
    }
    if (to !== null && !isNaN(to)) {
      conditions.push('ts_start <= ?');
      params.push(to);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (open !== undefined) {
      if (open === 'true' || open === true) {
        conditions.push('ts_end IS NULL');
      } else if (open === 'false' || open === false) {
        conditions.push('ts_end IS NOT NULL');
      }
    }

    let query = 'SELECT * FROM alerts';
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY ts_start DESC LIMIT 200';

    const alerts = db.prepare(query).all(...params);

    return res.json({
      data: alerts,
      error: null,
      meta: { count: alerts.length, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: GET /alerts] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/alerts/open
 * Returns all open alerts (ts_end IS NULL)
 */
router.get('/open', (req, res) => {
  try {
    const openAlerts = getOpenAlerts();
    return res.json({
      data: openAlerts,
      error: null,
      meta: { count: openAlerts.length, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: GET /alerts/open] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * PATCH /api/alerts/:id/acknowledge
 * Sets acknowledged_at = Date.now()
 */
router.patch('/:id/acknowledge', (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);
    const db = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);

    if (!alert) {
      return res.status(404).json({
        data: null,
        error: 'Alert not found',
        meta: { timestamp: Date.now() }
      });
    }

    const now = Date.now();
    db.prepare('UPDATE alerts SET acknowledged_at = ? WHERE id = ?').run(now, alertId);

    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    return res.json({
      data: updated,
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: PATCH /alerts/:id/acknowledge] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * PATCH /api/alerts/:id/close
 * Sets ts_end = Date.now() (manual close)
 */
router.patch('/:id/close', (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);
    const db = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);

    if (!alert) {
      return res.status(404).json({
        data: null,
        error: 'Alert not found',
        meta: { timestamp: Date.now() }
      });
    }

    const now = Date.now();
    db.prepare('UPDATE alerts SET ts_end = ? WHERE id = ?').run(now, alertId);

    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    return res.json({
      data: updated,
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: PATCH /alerts/:id/close] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
