const express = require('express');
const { Parser } = require('json2csv');
const { getDb } = require('../db');

const router = express.Router();

/**
 * GET /api/reports/events
 * Query params: from, to. Returns CSV of entry_exit_events in range.
 */
router.get('/events', (req, res) => {
  try {
    const db = getDb();
    const from = req.query.from ? parseInt(req.query.from, 10) : 0;
    const to = req.query.to ? parseInt(req.query.to, 10) : Date.now();

    const rows = db.prepare(`
      SELECT id, ts, type, count, source
      FROM entry_exit_events
      WHERE ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `).all(from, to);

    const fields = ['id', 'ts', 'type', 'count', 'source'];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=events-${dateStr}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error('[Route: GET /reports/events] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/reports/occupancy
 * Query params: from, to. Returns CSV of occupancy_samples in range.
 */
router.get('/occupancy', (req, res) => {
  try {
    const db = getDb();
    const from = req.query.from ? parseInt(req.query.from, 10) : 0;
    const to = req.query.to ? parseInt(req.query.to, 10) : Date.now();

    const rows = db.prepare(`
      SELECT id, ts, occupancy, capacity, available, percentage, status, source
      FROM occupancy_samples
      WHERE ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `).all(from, to);

    const fields = ['id', 'ts', 'occupancy', 'capacity', 'available', 'percentage', 'status', 'source'];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=occupancy-${dateStr}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error('[Route: GET /reports/occupancy] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/reports/session/:id
 * Returns CSV for a session's occupancy samples.
 */
router.get('/session/:id', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const db = getDb();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    if (!session) {
      return res.status(404).json({
        data: null,
        error: 'Session not found',
        meta: { timestamp: Date.now() }
      });
    }

    const startTs = session.started_at || 0;
    const endTs = session.ended_at || Date.now();

    const rows = db.prepare(`
      SELECT id, ts, occupancy, capacity, available, percentage, status, source
      FROM occupancy_samples
      WHERE ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `).all(startTs, endTs);

    const fields = ['id', 'ts', 'occupancy', 'capacity', 'available', 'percentage', 'status', 'source'];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=session-${sessionId}-occupancy.csv`);
    return res.send(csv);
  } catch (err) {
    console.error('[Route: GET /reports/session/:id] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
