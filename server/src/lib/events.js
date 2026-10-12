let ioInstance = null;

/**
 * Injects the Socket.IO server instance.
 * @param {import('socket.io').Server} io
 */
function setIo(io) {
  ioInstance = io;
  console.log('[Broadcaster] Socket.IO instance registered');
}

/**
 * Broadcasts an event and data payload to all connected Socket.IO clients.
 * @param {string} event
 * @param {any} data
 */
function broadcast(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  } else {
    console.warn(`[Broadcaster] Attempted to broadcast '${event}' but Socket.IO is not set`);
  }
}

module.exports = {
  setIo,
  broadcast
};
