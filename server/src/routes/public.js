const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { getLatestSample, getSetting } = require('../lib/ingestion');
const { getMqttStatus } = require('../mqtt');

/**
 * GET /api/public/sensor/:code
 * Public endpoint: Look up a sensor by code and return its live occupancy status
 */
router.get('/sensor/:code', (req, res) => {
  try {
    const rawCode = req.params.code ? req.params.code.trim().toUpperCase() : '';
    const db = getDb();

    // Look up sensor in database
    const sensor = db.prepare('SELECT * FROM sensors WHERE UPPER(code) = ?').get(rawCode);

    if (!sensor) {
      return res.status(404).json({
        data: null,
        error: `Sensor with code '${rawCode}' not found. Please verify the code.`,
        meta: { timestamp: Date.now() }
      });
    }

    // Fetch latest occupancy sample
    const sample = getLatestSample();
    const mqtt = getMqttStatus();

    const staleSecs = parseInt(getSetting('stale_threshold_seconds', '60'), 10);
    const now = Date.now();
    const isStale = !sample || (now - sample.ts > staleSecs * 1000);

    const occupancy = sample ? sample.occupancy : 0;
    const capacity = sample ? sample.capacity : parseInt(getSetting('default_capacity', '10'), 10);
    const available = sample ? sample.available : Math.max(0, capacity - occupancy);
    const percentage = sample ? sample.percentage : (capacity > 0 ? Math.round((occupancy * 100) / capacity) : 0);
    const status = sample ? sample.status : 'NORMAL';

    return res.json({
      data: {
        sensor: {
          code: sensor.code,
          name: sensor.name,
          location: sensor.location || 'Facility Entrance'
        },
        occupancy,
        capacity,
        available,
        percentage,
        status,
        lastUpdatedAt: sample ? sample.ts : null,
        isStale,
        mqttConnected: mqtt.connected
      },
      error: null,
      meta: { timestamp: now }
    });
  } catch (err) {
    console.error('[Public API] Error fetching sensor status:', err);
    return res.status(500).json({
      data: null,
      error: 'Failed to retrieve sensor data',
      meta: { timestamp: Date.now() }
    });
  }
});

/**
 * POST /api/public/auth/login
 * Simple login verification for admin portal
 */
router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const configuredPassword = process.env.ADMIN_PASSWORD || getSetting('admin_password', 'admin123');
    const configuredUsername = process.env.ADMIN_USERNAME || 'admin';

    if (username === configuredUsername && password === configuredPassword) {
      return res.json({
        data: {
          authenticated: true,
          username: configuredUsername,
          role: 'admin',
          token: 'admin-session-' + Date.now()
        },
        error: null,
        meta: { timestamp: Date.now() }
      });
    }

    return res.status(401).json({
      data: null,
      error: 'Invalid username or password',
      meta: { timestamp: Date.now() }
    });
  } catch (err) {
    return res.status(500).json({
      data: null,
      error: 'Authentication failed',
      meta: { timestamp: Date.now() }
    });
  }
});

module.exports = router;
