const { getDb } = require('../db');

/**
 * Net-flow estimator predicting time to reach maximum capacity.
 * Looks at the last 30 minutes of entry_exit_events.
 * 
 * @param {number} currentOccupancy
 * @param {number} capacity
 * @returns {object|null}
 */
function estimateTimeToCapacity(currentOccupancy, capacity) {
  if (currentOccupancy >= capacity) {
    return null;
  }

  const db = getDb();
  const windowMs = 30 * 60 * 1000; // 30 minutes
  const windowStart = Date.now() - windowMs;

  const rows = db.prepare(`
    SELECT type, count
    FROM entry_exit_events
    WHERE ts >= ?
  `).all(windowStart);

  let totalEntries = 0;
  let totalExits = 0;
  const countDataPoints = rows.length;

  for (const row of rows) {
    if (row.type === 'delta_entry' || row.type === 'entry') {
      totalEntries += row.count;
    } else if (row.type === 'delta_exit' || row.type === 'exit') {
      totalExits += row.count;
    }
  }

  const netEntries = totalEntries - totalExits;
  const netFlowPerMinute = netEntries / 30;

  // If net flow <= 0, capacity is not being approached
  if (netFlowPerMinute <= 0) {
    return null;
  }

  const remaining = capacity - currentOccupancy;
  const estimatedMinutesToCapacity = Math.round((remaining / netFlowPerMinute) * 10) / 10;
  const confidence = countDataPoints >= 10 ? 'medium' : 'low';

  return {
    netFlowPerMinute: Math.round(netFlowPerMinute * 100) / 100,
    estimatedMinutesToCapacity,
    confidence,
    note: 'Based on last 30 minutes of snapshot deltas. This is an estimate only.'
  };
}

module.exports = {
  estimateTimeToCapacity
};
