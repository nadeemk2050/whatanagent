import { WebSocketServer, WebSocket } from 'ws';

/**
 * High-Speed, Sub-15ms Real-Time WebSocket Hub for Live Collaborative Board
 * Handles in-flight drawing streams, 60fps laser/cursor broadcasts, live calculations,
 * checklist updates, and room-level channel multiplexing.
 */

// room -> Set of WebSocket clients with user metadata
const rooms = new Map();

export function initLiveMeetingWebSocket(server, db) {
  const wss = new WebSocketServer({ server, path: '/ws/live-meeting' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.currentRoomId = null;
    ws.userMeta = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg || !msg.type) return;

        switch (msg.type) {
          // 1. Join Room Channel
          case 'join_room': {
            const { roomId, user } = msg;
            if (!roomId) return;

            // Leave previous room if any
            if (ws.currentRoomId && rooms.has(ws.currentRoomId)) {
              rooms.get(ws.currentRoomId).delete(ws);
            }

            ws.currentRoomId = roomId;
            ws.userMeta = user || { name: 'Collaborator', color: '#38bdf8' };

            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Set());
            }
            rooms.get(roomId).add(ws);

            // Announce presence to room members
            broadcastToRoom(roomId, ws, {
              type: 'user_joined',
              user: ws.userMeta,
              totalClients: rooms.get(roomId).size
            });
            break;
          }

          // 2. Real-Time In-Flight Stroke Streaming (sub-15ms drawing)
          case 'stroke_start':
          case 'stroke_chunk':
          case 'stroke_end':
          case 'shape_draw':
          case 'clear_canvas':
          case 'undo_canvas':
          case 'redo_canvas': {
            if (!ws.currentRoomId) return;
            broadcastToRoom(ws.currentRoomId, ws, msg);
            break;
          }

          // 3. 60fps Laser Pointer & Remote Cursor Broadcast
          case 'cursor_move':
          case 'reaction': {
            if (!ws.currentRoomId) return;
            broadcastToRoom(ws.currentRoomId, ws, msg);
            break;
          }

          // 4. Live Calculations & Checklist Realtime Deltas
          case 'calc_change':
          case 'task_toggle':
          case 'task_add':
          case 'task_delete':
          case 'sticky_update':
          case 'sticky_move':
          case 'sticky_delete':
          case 'poll_vote': {
            if (!ws.currentRoomId) return;
            broadcastToRoom(ws.currentRoomId, ws, msg);
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          }
        }
      } catch (err) {
        console.warn('[LIVE WS] Message parse error:', err.message);
      }
    });

    ws.on('close', () => {
      if (ws.currentRoomId && rooms.has(ws.currentRoomId)) {
        const set = rooms.get(ws.currentRoomId);
        set.delete(ws);
        if (set.size === 0) {
          rooms.delete(ws.currentRoomId);
        } else {
          broadcastToRoom(ws.currentRoomId, ws, {
            type: 'user_left',
            user: ws.userMeta,
            totalClients: set.size
          });
        }
      }
    });

    ws.on('error', (err) => {
      console.warn('[LIVE WS] Socket error:', err.message);
    });
  });

  // Heartbeat ping loop (30s) to keep connections alive and clean up stale sockets
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('⚡ [LIVE WS] High-speed Live Board WebSocket Server mounted at /ws/live-meeting');
  return wss;
}

function broadcastToRoom(roomId, senderWs, payload) {
  if (!roomId || !rooms.has(roomId)) return;
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const clients = rooms.get(roomId);

  for (const client of clients) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  }
}
