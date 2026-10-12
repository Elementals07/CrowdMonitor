const express = require('express');
const { z } = require('zod');
const { Parser } = require('json2csv');
const { getDb } = require('../db');
const { getLatestSample } = require('../lib/ingestion');

const router = express.Router();

/**
 * GET /api/sessions
 * Returns all sessions ordered by id DESC
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY id DESC').all();

    return res.json({
      data: sessions,
      error: null,
      meta: { count: sessions.length, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: GET /sessions] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

const createSessionSchema = z.object({
  name: z.string().trim().min(1).max(100)
});

/**
 * POST /api/sessions
 * Creates a new session with state='idle'.
 */
router.post('/', (req, res) => {
  try {
    const parseResult = createSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        data: null,
        error: parseResult.error.issues.map(i => i.message).join(', '),
        meta: { timestamp: Date.now() }
      });
    }

    const { name } = parseResult.data;
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO sessions (name, state, started_at, ended_at, capacity_at_start, capacity_at_end, notes)
      VALUES (?, 'idle', NULL, NULL, NULL, NULL, NULL)
    `).run(name);

    const newSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      data: newSession,
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: POST /sessions] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/sessions/:id
 * Returns session + summary stats
 */
router.get('/:id', (req, res) => {
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

    let stats = {
      peakOccupancy: 0,
      avgOccupancy: 0,
      totalEntries: 0,
      totalExits: 0,
      overCapacityDurationMinutes: 0,
      sampleCount: 0
    };

    if (session.started_at) {
      const startTs = session.started_at;
      const endTs = session.ended_at || Date.now();

      const sampleStats = db.prepare(`
        SELECT 
          MAX(occupancy) as peakOccupancy,
          AVG(occupancy) as avgOccupancy,
          COUNT(*) as sampleCount,
          SUM(CASE WHEN status = 'OVERLIMIT' THEN 1 ELSE 0 END) as overlimitCount
        FROM occupancy_samples
        WHERE ts >= ? AND ts <= ?
      `).get(startTs, endTs);

      const eventStats = db.prepare(`
        SELECT 
          SUM(CASE WHEN type IN ('entry', 'delta_entry') THEN count ELSE 0 END) as totalEntries,
          SUM(CASE WHEN type IN ('exit', 'delta_exit') THEN count ELSE 0 END) as totalExits
        FROM entry_exit_events
        WHERE ts >= ? AND ts <= ?
      `).get(startTs, endTs);

      const overlimitCount = sampleStats?.overlimitCount || 0;
      stats = {
        peakOccupancy: sampleStats?.peakOccupancy || 0,
        avgOccupancy: sampleStats?.avgOccupancy ? Math.round(sampleStats.avgOccupancy * 10) / 10 : 0,
        totalEntries: eventStats?.totalEntries || 0,
        totalExits: eventStats?.totalExits || 0,
        overCapacityDurationMinutes: Math.round((overlimitCount * 5) / 60 * 10) / 10,
        sampleCount: sampleStats?.sampleCount || 0
      };
    }

    return res.json({
      data: {
        session,
        stats
      },
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: GET /sessions/:id] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * PUT /api/sessions/:id/start
 * Starts an idle session (state -> 'running', sets started_at, capacity_at_start from latest sample).
 * Prevents starting if another session is already running.
 */
router.put('/:id/start', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const db = getDb();

    // Check if any session is already running
    const runningSession = db.prepare("SELECT * FROM sessions WHERE state = 'running'").get();
    if (runningSession && runningSession.id !== sessionId) {
      return res.status(409).json({
        data: null,
        error: `Another session (${runningSession.name}) is already running`,
        meta: { timestamp: Date.now() }
      });
    }

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({
        data: null,
        error: 'Session not found',
        meta: { timestamp: Date.now() }
      });
    }

    if (session.state !== 'idle') {
      return res.status(400).json({
        data: null,
        error: `Session cannot be started from state '${session.state}'`,
        meta: { timestamp: Date.now() }
      });
    }

    const latestSample = getLatestSample();
    const capacityAtStart = latestSample ? latestSample.capacity : 10;
    const now = Date.now();

    db.prepare(`
      UPDATE sessions
      SET state = 'running', started_at = ?, capacity_at_start = ?
      WHERE id = ?
    `).run(now, capacityAtStart, sessionId);

    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    return res.json({
      data: updated,
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: PUT /sessions/:id/start] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * PUT /api/sessions/:id/end
 * Ends a running session (state -> 'ended', sets ended_at, capacity_at_end).
 * Prevents ending a non-running session.
 */
router.put('/:id/end', (req, res) => {
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

    if (session.state !== 'running') {
      return res.status(400).json({
        data: null,
        error: `Cannot end session in state '${session.state}' (must be 'running')`,
        meta: { timestamp: Date.now() }
      });
    }

    const latestSample = getLatestSample();
    const capacityAtEnd = latestSample ? latestSample.capacity : (session.capacity_at_start || 10);
    const now = Date.now();

    db.prepare(`
      UPDATE sessions
      SET state = 'ended', ended_at = ?, capacity_at_end = ?
      WHERE id = ?
    `).run(now, capacityAtEnd, sessionId);

    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    return res.json({
      data: updated,
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: PUT /sessions/:id/end] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * DELETE /api/sessions/:id
 * Only allowed if session is 'idle'. Delete idle sessions.
 */
router.delete('/:id', (req, res) => {
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

    if (session.state !== 'idle') {
      return res.status(400).json({
        data: null,
        error: `Only idle sessions can be deleted (current state: '${session.state}')`,
        meta: { timestamp: Date.now() }
      });
    }

    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

    return res.json({
      data: { deleted: true, id: sessionId },
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: DELETE /sessions/:id] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/sessions/:id/export
 * Returns CSV of occupancy samples during this session's start/end range.
 */
router.get('/:id/export', (req, res) => {
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

    const samples = db.prepare(`
      SELECT id, ts, occupancy, capacity, available, percentage, status, source
      FROM occupancy_samples
      WHERE ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `).all(startTs, endTs);

    const fields = ['id', 'ts', 'occupancy', 'capacity', 'available', 'percentage', 'status', 'source'];
    const parser = new Parser({ fields });
    const csv = parser.parse(samples);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="session-${sessionId}-occupancy.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[Route: GET /sessions/:id/export] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
