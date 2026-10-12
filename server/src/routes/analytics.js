const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

/**
 * GET /api/analytics/summary
 * Query params: from (unix ms), to (unix ms)
 */
router.get('/summary', (req, res) => {
  try {
    const db = getDb();
    const from = req.query.from ? parseInt(req.query.from, 10) : null;
    const to = req.query.to ? parseInt(req.query.to, 10) : null;

    let sampleWhere = [];
    let sampleParams = [];
    if (from !== null && !isNaN(from)) {
      sampleWhere.push('ts >= ?');
      sampleParams.push(from);
    }
    if (to !== null && !isNaN(to)) {
      sampleWhere.push('ts <= ?');
      sampleParams.push(to);
    }
    const sampleWhereClause = sampleWhere.length > 0 ? `WHERE ${sampleWhere.join(' AND ')}` : '';

    const summaryRow = db.prepare(`
      SELECT 
        MAX(occupancy) as peakOccupancy,
        AVG(occupancy) as avgOccupancy,
        COUNT(*) as sampleCount,
        SUM(CASE WHEN status = 'OVERLIMIT' THEN 1 ELSE 0 END) as overlimitCount
      FROM occupancy_samples
      ${sampleWhereClause}
    `).get(...sampleParams);

    // Entry and exit sums
    let eventWhere = [];
    let eventParams = [];
    if (from !== null && !isNaN(from)) {
      eventWhere.push('ts >= ?');
      eventParams.push(from);
    }
    if (to !== null && !isNaN(to)) {
      eventWhere.push('ts <= ?');
      eventParams.push(to);
    }
    const eventWhereClause = eventWhere.length > 0 ? `WHERE ${eventWhere.join(' AND ')}` : '';

    const eventsRow = db.prepare(`
      SELECT 
        SUM(CASE WHEN type IN ('entry', 'delta_entry') THEN count ELSE 0 END) as totalEntries,
        SUM(CASE WHEN type IN ('exit', 'delta_exit') THEN count ELSE 0 END) as totalExits,
        SUM(CASE WHEN source = 'event_topic' THEN 1 ELSE 0 END) as dedicatedEventCount
      FROM entry_exit_events
      ${eventWhereClause}
    `).get(...eventParams);

    const peakOccupancy = summaryRow?.peakOccupancy !== null && summaryRow?.peakOccupancy !== undefined ? summaryRow.peakOccupancy : 0;
    const avgOccupancy = summaryRow?.avgOccupancy !== null && summaryRow?.avgOccupancy !== undefined ? Math.round(summaryRow.avgOccupancy * 10) / 10 : 0;
    const sampleCount = summaryRow?.sampleCount || 0;
    const overlimitCount = summaryRow?.overlimitCount || 0;

    // Approximate minutes where status was OVERLIMIT
    // Average publishing interval estimated around 5-10 seconds per sample or calculated from data
    const estimatedIntervalSeconds = 5;
    const overCapacityMinutes = Math.round((overlimitCount * estimatedIntervalSeconds) / 60 * 10) / 10;

    const totalEntries = eventsRow?.totalEntries || 0;
    const totalExits = eventsRow?.totalExits || 0;
    const hasEventTopics = (eventsRow?.dedicatedEventCount || 0) > 0;

    return res.json({
      data: {
        peakOccupancy,
        avgOccupancy,
        totalEntries,
        totalExits,
        overCapacityMinutes,
        sampleCount,
        hasEventTopics
      },
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: /analytics/summary] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/analytics/timeseries
 * Query params: from, to, granularity ('hour' | 'day' | 'week' | 'month')
 * Returns array of { bucket, ts, occupancy, avgOccupancy, peakOccupancy, entries, exits, capacity }
 */
router.get('/timeseries', (req, res) => {
  try {
    const db = getDb();
    const from = req.query.from ? parseInt(req.query.from, 10) : 0;
    const to = req.query.to ? parseInt(req.query.to, 10) : Date.now();
    const granularity = req.query.granularity || 'hour';

    let strftimeFmt;
    switch (granularity) {
      case 'day':
        strftimeFmt = '%Y-%m-%d';
        break;
      case 'week':
        strftimeFmt = '%Y-W%W';
        break;
      case 'month':
        strftimeFmt = '%Y-%m';
        break;
      case 'hour':
      default:
        strftimeFmt = '%Y-%m-%d %H:00:00';
        break;
    }

    // Group occupancy samples by bucket
    const samples = db.prepare(`
      SELECT 
        strftime('${strftimeFmt}', ts / 1000, 'unixepoch') as bucket,
        MIN(ts) as ts,
        AVG(occupancy) as avgOccupancy,
        MAX(occupancy) as peakOccupancy,
        MAX(capacity) as capacity
      FROM occupancy_samples
      WHERE ts >= ? AND ts <= ?
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(from, to);

    // Group entry/exit events by bucket
    const events = db.prepare(`
      SELECT 
        strftime('${strftimeFmt}', ts / 1000, 'unixepoch') as bucket,
        SUM(CASE WHEN type IN ('entry', 'delta_entry') THEN count ELSE 0 END) as entries,
        SUM(CASE WHEN type IN ('exit', 'delta_exit') THEN count ELSE 0 END) as exits
      FROM entry_exit_events
      WHERE ts >= ? AND ts <= ?
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(from, to);

    const eventMap = new Map();
    for (const ev of events) {
      eventMap.set(ev.bucket, ev);
    }

    const timeseries = samples.map((s) => {
      const ev = eventMap.get(s.bucket) || { entries: 0, exits: 0 };
      const avg = Math.round(s.avgOccupancy * 10) / 10;
      return {
        bucket: s.bucket,
        period: s.bucket,
        ts: s.ts,
        occupancy: avg,
        avgOccupancy: avg,
        peakOccupancy: s.peakOccupancy,
        capacity: s.capacity,
        entries: ev.entries || 0,
        exits: ev.exits || 0
      };
    });

    return res.json({
      data: timeseries,
      error: null,
      meta: { count: timeseries.length, granularity, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: /analytics/timeseries] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/analytics/heatmap
 * 7x24 matrix: dayOfWeek (0-6), hour (0-23), avgOccupancy, sampleCount
 */
router.get('/heatmap', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        CAST(strftime('%w', ts / 1000, 'unixepoch') AS INTEGER) as dayOfWeek,
        CAST(strftime('%H', ts / 1000, 'unixepoch') AS INTEGER) as hour,
        AVG(occupancy) as avgOccupancy,
        COUNT(*) as sampleCount
      FROM occupancy_samples
      GROUP BY dayOfWeek, hour
      ORDER BY dayOfWeek ASC, hour ASC
    `).all();

    // Fill in complete 7x24 grid (defaulting to 0 where no samples exist)
    const map = new Map();
    for (const r of rows) {
      map.set(`${r.dayOfWeek}-${r.hour}`, {
        dayOfWeek: r.dayOfWeek,
        hour: r.hour,
        avgOccupancy: Math.round(r.avgOccupancy * 10) / 10,
        sampleCount: r.sampleCount
      });
    }

    const grid = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        if (map.has(key)) {
          grid.push(map.get(key));
        } else {
          grid.push({
            dayOfWeek: day,
            hour,
            avgOccupancy: 0,
            sampleCount: 0
          });
        }
      }
    }

    return res.json({
      data: grid,
      error: null,
      meta: { totalCells: grid.length, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: /analytics/heatmap] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * GET /api/analytics/busiest
 * Returns busiest hour and busiest day of week based on historical occupancy.
 */
router.get('/busiest', (req, res) => {
  try {
    const db = getDb();

    const busiestHourRow = db.prepare(`
      SELECT 
        CAST(strftime('%H', ts / 1000, 'unixepoch') AS INTEGER) as hour,
        AVG(occupancy) as avgOccupancy
      FROM occupancy_samples
      GROUP BY hour
      ORDER BY avgOccupancy DESC
      LIMIT 1
    `).get();

    const busiestDayRow = db.prepare(`
      SELECT 
        CAST(strftime('%w', ts / 1000, 'unixepoch') AS INTEGER) as dayOfWeek,
        AVG(occupancy) as avgOccupancy
      FROM occupancy_samples
      GROUP BY dayOfWeek
      ORDER BY avgOccupancy DESC
      LIMIT 1
    `).get();

    return res.json({
      data: {
        busiestHour: busiestHourRow ? {
          hour: busiestHourRow.hour,
          avgOccupancy: Math.round(busiestHourRow.avgOccupancy * 10) / 10
        } : null,
        busiestDay: busiestDayRow ? {
          dayOfWeek: busiestDayRow.dayOfWeek,
          avgOccupancy: Math.round(busiestDayRow.avgOccupancy * 10) / 10
        } : null
      },
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: /analytics/busiest] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
