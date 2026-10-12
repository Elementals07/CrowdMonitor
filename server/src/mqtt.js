const mqtt = require('mqtt');
const { getDb } = require('./db');
const { broadcast } = require('./lib/events');
const { processOccupancyMessage, processDedicatedEvent } = require('./lib/ingestion');

let client = null;
let lastMessageAt = null;
let reconnectCount = 0;
let isConnected = false;
let withinRetainedGrace = false;
let retainedTimer = null;

const TOPIC_OCCUPANCY = process.env.MQTT_TOPIC_OCCUPANCY || 'crowd/occupancy';
const TOPIC_CAPACITY = process.env.MQTT_TOPIC_CAPACITY || 'crowd/capacity';
const TOPIC_ENTRY = process.env.MQTT_TOPIC_ENTRY || 'crowd/entry';
const TOPIC_EXIT = process.env.MQTT_TOPIC_EXIT || 'crowd/exit';

/**
 * Record a connection event in the SQLite database.
 * @param {string} event
 * @param {string|null} detail
 */
function recordConnectionEvent(event, detail = null) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO connection_events (ts, event, detail)
      VALUES (?, ?, ?)
    `).run(Date.now(), event, detail);
  } catch (err) {
    console.error('[MQTT] Failed to insert connection event:', err.message);
  }
}

/**
 * Broadcast current MQTT connection status to clients.
 */
function broadcastMqttStatus() {
  const status = getMqttStatus();
  broadcast('mqtt:status', status);
}

/**
 * Returns current status of the MQTT connection.
 */
function getMqttStatus() {
  return {
    connected: isConnected,
    lastMessageAt,
    reconnectCount,
    broker: process.env.MQTT_BROKER_URL || 'undefined'
  };
}

/**
 * Starts the MQTT client and configures event listeners.
 * @param {import('socket.io').Server} [ioInstance]
 */
function startMqtt(ioInstance) {
  const brokerUrl = process.env.MQTT_BROKER_URL;

  if (!brokerUrl) {
    console.warn('[MQTT] MQTT_BROKER_URL is not set in environment. MQTT client will not connect.');
    return;
  }

  const options = {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `CrowdMonitor-Server-${Math.random().toString(16).slice(2)}`,
    rejectUnauthorized: false, // HiveMQ Cloud serverless uses self-signed-like certs
    reconnectPeriod: 5000,
    connectTimeout: 15000,
    clean: true
  };

  console.log(`[MQTT] Connecting to broker at ${brokerUrl} with clientId ${options.clientId}...`);

  client = mqtt.connect(brokerUrl, options);

  client.on('connect', () => {
    isConnected = true;
    console.log('[MQTT] Connected successfully to MQTT broker');
    recordConnectionEvent('connect', `Connected to ${brokerUrl}`);
    broadcastMqttStatus();

    // Subscribe to required topics
    const topicsToSub = [TOPIC_OCCUPANCY, TOPIC_CAPACITY, TOPIC_ENTRY, TOPIC_EXIT];
    client.subscribe(topicsToSub, { qos: 1 }, (err) => {
      if (err) {
        console.error('[MQTT] Subscription error:', err.message);
      } else {
        console.log(`[MQTT] Subscribed to topics: ${topicsToSub.join(', ')}`);
      }
    });

    // Handle initial retained message grace period (2000ms)
    withinRetainedGrace = true;
    if (retainedTimer) clearTimeout(retainedTimer);
    retainedTimer = setTimeout(() => {
      withinRetainedGrace = false;
      console.log('[MQTT] Retained message grace window ended');
    }, 2000);
  });

  client.on('message', (topic, payload) => {
    lastMessageAt = Date.now();
    console.log(`[MQTT] Message received on topic [${topic}]: ${payload.toString()}`);

    try {
      if (topic === TOPIC_OCCUPANCY) {
        processOccupancyMessage(payload, withinRetainedGrace);
      } else if (topic === TOPIC_ENTRY) {
        processDedicatedEvent('entry', payload);
      } else if (topic === TOPIC_EXIT) {
        processDedicatedEvent('exit', payload);
      } else if (topic === TOPIC_CAPACITY) {
        console.log(`[MQTT] Capacity confirmation received on ${topic}: ${payload.toString()}`);
      }
    } catch (err) {
      console.error(`[MQTT] Error processing message from ${topic}:`, err);
    }
  });

  client.on('reconnect', () => {
    reconnectCount += 1;
    console.warn(`[MQTT] Reconnecting to broker (attempt ${reconnectCount})...`);
    recordConnectionEvent('reconnect', `Attempt ${reconnectCount}`);
    broadcastMqttStatus();
  });

  client.on('offline', () => {
    isConnected = false;
    console.warn('[MQTT] Client went offline');
    recordConnectionEvent('offline');
    broadcastMqttStatus();
  });

  client.on('close', () => {
    isConnected = false;
    console.warn('[MQTT] Client connection closed');
    recordConnectionEvent('close');
    broadcastMqttStatus();
  });

  client.on('error', (err) => {
    isConnected = false;
    console.error('[MQTT] Connection error:', err.message);
    recordConnectionEvent('error', err.message);
    broadcastMqttStatus();
  });
}

/**
 * Publishes a new target capacity to crowd/capacity with retain=true and qos=1.
 * @param {number} newCapacity
 * @returns {Promise<boolean>}
 */
function publishCapacity(newCapacity) {
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) {
      return reject(new Error('MQTT client is not connected'));
    }

    const payload = String(newCapacity);
    console.log(`[MQTT] Publishing capacity ${payload} to ${TOPIC_CAPACITY} (retain: true, qos: 1)`);

    client.publish(TOPIC_CAPACITY, payload, { retain: true, qos: 1 }, (err) => {
      if (err) {
        console.error('[MQTT] Failed to publish capacity:', err.message);
        return reject(err);
      }
      console.log(`[MQTT] Successfully published capacity ${payload}`);
      resolve(true);
    });
  });
}

module.exports = {
  startMqtt,
  publishCapacity,
  getMqttStatus
};
