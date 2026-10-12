const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db');

const router = express.Router();

const ALLOWED_SETTING_KEYS = [
  'warning_threshold_pct',
  'critical_threshold_pct',
  'facility_timezone',
  'stale_threshold_seconds',
  'default_capacity'
];

/**
 * GET /api/settings
 * Returns all settings as key-value object
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();

    const settingsObj = {};
    for (const r of rows) {
      settingsObj[r.key] = r.value;
    }

    return res.json({
      data: settingsObj,
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: GET /settings] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

const updateSettingSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()])
});

/**
 * PUT /api/settings/:key
 * Body: { value: string }
 * Updates a setting.
 */
router.put('/:key', (req, res) => {
  try {
    const { key } = req.params;

    if (!ALLOWED_SETTING_KEYS.includes(key)) {
      return res.status(400).json({
        data: null,
        error: `Unknown setting key '${key}'. Allowed keys: ${ALLOWED_SETTING_KEYS.join(', ')}`,
        meta: { timestamp: Date.now() }
      });
    }

    const parseResult = updateSettingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        data: null,
        error: parseResult.error.issues.map(i => i.message).join(', '),
        meta: { timestamp: Date.now() }
      });
    }

    const rawVal = parseResult.data.value;
    const stringVal = String(rawVal).trim();

    // Specific validation per setting key
    if (key === 'warning_threshold_pct' || key === 'critical_threshold_pct') {
      const num = parseInt(stringVal, 10);
      if (isNaN(num) || num < 1 || num > 200) {
        return res.status(400).json({
          data: null,
          error: `${key} must be an integer between 1 and 200`,
          meta: { timestamp: Date.now() }
        });
      }
    } else if (key === 'stale_threshold_seconds') {
      const num = parseInt(stringVal, 10);
      if (isNaN(num) || num < 5 || num > 3600) {
        return res.status(400).json({
          data: null,
          error: 'stale_threshold_seconds must be an integer between 5 and 3600',
          meta: { timestamp: Date.now() }
        });
      }
    } else if (key === 'default_capacity') {
      const num = parseInt(stringVal, 10);
      if (isNaN(num) || num < 1 || num > 10000) {
        return res.status(400).json({
          data: null,
          error: 'default_capacity must be an integer between 1 and 10000',
          meta: { timestamp: Date.now() }
        });
      }
    } else if (key === 'facility_timezone') {
      if (!stringVal || stringVal.length < 3) {
        return res.status(400).json({
          data: null,
          error: 'facility_timezone cannot be empty',
          meta: { timestamp: Date.now() }
        });
      }
    }

    const db = getDb();
    const now = Date.now();

    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, stringVal, now);

    return res.json({
      data: {
        key,
        value: stringVal
      },
      error: null,
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    console.error('[Route: PUT /settings/:key] Error:', err);
    return res.status(500).json({
      data: null,
      error: err.message,
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
