const http = require('http');
const { WebSocketServer } = require('ws');

function authorizeChannel({ schoolId, requestedSchoolId }) {
  if (!schoolId || !requestedSchoolId || schoolId !== requestedSchoolId) {
    throw new Error('Forbidden: school channel mismatch.');
  }
  return true;
}

function authenticateConnection({ token, expectedSchoolId, verifyToken = () => null }) {
  const mode = process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'production' : 'local');
  if (mode !== 'production') {
    if (mode !== 'local') throw new Error('Unauthorized: explicit local or production mode required.');
    return { schoolId: expectedSchoolId, mode: 'LOCAL_MOCK' };
  }
  if (!token) throw new Error('Unauthorized: bearer token required.');
  const claims = verifyToken(token);
  authorizeChannel({ schoolId: claims.schoolId || claims['custom:schoolId'], requestedSchoolId: expectedSchoolId });
  return { schoolId: claims.schoolId || claims['custom:schoolId'], mode: 'COGNITO_BOUNDARY' };
}

function createWebSocketServer({ port = process.env.PORT || 8080 } = {}) {
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'smartbreath-websocket' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const websocket = new WebSocketServer({ server: httpServer });
  const channels = new Map();

  const heartbeat = setInterval(() => {
    for (const clients of channels.values()) for (const client of clients) {
      if (client.isAlive === false) { client.terminate(); continue; }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);

  websocket.on('connection', (socket, request) => {
    const url = new URL(request.url, `http://localhost:${port}`);
    const schoolId = url.searchParams.get('schoolId');
    const userId = url.searchParams.get('userId');
    const protocol = request.headers['sec-websocket-protocol'];
    const token = request.headers.authorization?.replace(/^Bearer /, '') ||
      (protocol && protocol.split(',').map((item) => item.trim()).find((item) => item.startsWith('bearer.'))?.slice(7));
    try {
      authenticateConnection({ token, expectedSchoolId: schoolId });
    } catch {
      socket.close(1008, 'Unauthorized school channel');
      return;
    }
    socket.schoolId = schoolId;
    socket.userId = userId;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    if (!channels.has(schoolId)) channels.set(schoolId, new Set());
    channels.get(schoolId).add(socket);
    socket.send(JSON.stringify({ type: 'connection', status: 'LIVE', schoolId }));
    socket.on('close', () => {
      const channel = channels.get(schoolId);
      channel?.delete(socket);
      if (channel?.size === 0) channels.delete(schoolId);
    });
  });

  return {
    httpServer,
    websocket,
    publish(schoolId, event) {
      const clients = channels.get(schoolId) || [];
      for (const client of clients) if (client.readyState === 1) client.send(JSON.stringify(event));
    },
    start() { return new Promise((resolve) => httpServer.listen(port, resolve)); },
    stop() { clearInterval(heartbeat); return new Promise((resolve) => websocket.close(() => httpServer.close(resolve))); }
  };
}

if (require.main === module) createWebSocketServer().start().then(() => console.log('SmartBreath WebSocket server listening'));

module.exports = { authorizeChannel, authenticateConnection, createWebSocketServer };
