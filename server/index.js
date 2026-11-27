import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, GameError, AVATARS } from './room.js';
import { COLORS, CHAOS_KEYS, DOOM_KEYS } from '../shared/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, '../dist/public'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const rooms = new Map();
const sessions = new Map();

// ---------- Debug-Modus (FW_DEBUG=1) ----------
const DEBUG = process.env.FW_DEBUG === '1';
let debugId = 5_000_000;
const DEBUG_KINDS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'draw2', 'acid']);
function validDebugCard(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.kind === 'chaos') return CHAOS_KEYS.includes(c.effect) ? { color: 'x', kind: 'chaos', effect: c.effect } : null;
  if (c.kind === 'doom') return DOOM_KEYS.includes(c.effect) ? { color: 'd', kind: 'doom', effect: c.effect } : null;
  if (c.kind === 'wild' || c.kind === 'wild4') return { color: 'w', kind: c.kind };
  if (COLORS.includes(c.color) && DEBUG_KINDS.has(c.kind)) return { color: c.color, kind: c.kind };
  return null;
}

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, sessions: sessions.size }));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Nicht gefunden. Wurde der Client gebaut? (npm run build)');
      }
      const ext = path.extname(file);
      const immutable = file.includes(`${path.sep}assets${path.sep}`);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
});

// ---------- WebSocket ----------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Spieler';
const cleanAvatar = (a) => (AVATARS.includes(a) ? a : AVATARS[Math.floor(Math.random() * AVATARS.length)]);

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join('');
  while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = new Room(newCode(), { onDestroy: (r) => rooms.delete(r.code) });
  rooms.set(room.code, room);
  return room;
}

function leaveRoom(session) {
  const room = session.room;
  if (!room) return;
  const p = session.player;
  session.room = null;
  session.player = null;
  if (p) room.leave(p);
}

function makeSession() {
  const s = {
    token: crypto.randomUUID(),
    name: 'Spieler', avatar: cleanAvatar(), ws: null, room: null, player: null, lastSeen: Date.now(),
    send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); },
  };
  sessions.set(s.token, s);
  return s;
}

wss.on('connection', (ws) => {
  let session = null;
  let msgCount = 0;
  let windowStart = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    // einfache Flood-Bremse
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; msgCount = 0; }
    if (++msgCount > 30) return;

    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'hello') {
      session = (typeof msg.token === 'string' && sessions.get(msg.token)) || makeSession();
      if (session.ws && session.ws !== ws) {
        try { session.ws.close(4000, 'Neue Verbindung'); } catch {}
      }
      session.ws = ws;
      session.lastSeen = now;
      if (msg.name) session.name = cleanName(msg.name);
      if (msg.avatar) session.avatar = cleanAvatar(msg.avatar);
      session.send({ t: 'welcome', token: session.token, name: session.name, avatar: session.avatar, room: session.room?.code ?? null, debug: DEBUG });
      if (session.room) session.room.reconnected(session.player);
      else session.send({ t: 'noroom' });
      return;
    }
    if (!session) return;
    session.lastSeen = now;

    try {
      switch (msg.t) {
        case 'profile': {
          session.name = cleanName(msg.name);
          session.avatar = cleanAvatar(msg.avatar);
          const p = session.player;
          if (p && session.room?.phase === 'lobby') {
            p.name = session.name; p.avatar = session.avatar;
            session.room.afterAction(false);
          }
          return;
        }
        case 'create':
        case 'quick': {
          leaveRoom(session);
          const room = createRoom();
          session.player = room.addHuman(session);
          session.room = room;
          if (msg.t === 'quick') {
            const bots = Math.min(5, Math.max(1, Number(msg.bots) || 3));
            for (let i = 0; i < bots; i++) room.addBot();
            if (['neon', 'winter', 'garden'].includes(msg.theme)) room.settings.theme = msg.theme;
            if ([0, 5, 10, 20, 35].includes(msg.chaos)) room.settings.chaos = msg.chaos;
            room.handle(session.player, { t: 'start' });
          } else {
            room.afterAction(false);
          }
          return;
        }
        case 'join': {
          const code = String(msg.code ?? '').toUpperCase().trim();
          const room = rooms.get(code);
          if (!room) throw new GameError(`Raum „${code}“ gibt es nicht.`);
          if (session.room === room) return room.afterAction(false);
          const p = room.addHuman(session); // wirft, wenn voll/läuft
          leaveRoom(session);
          session.player = p;
          session.room = room;
          room.afterAction(false);
          return;
        }
        case 'leave':
          leaveRoom(session);
          session.send({ t: 'noroom' });
          return;
        case 'debugGive': {
          // Nur zum Testen: FW_DEBUG=1 → Karten auf eine Hand legen (eigene oder msg.target)
          if (!DEBUG || !session.player) return;
          const room = session.room;
          if (room?.phase !== 'playing') throw new GameError('Debug: Karten gibt es nur während einer Runde.');
          const target = room.byId(Number(msg.target)) ?? session.player;
          let given = 0;
          for (const c of (msg.cards ?? []).slice(0, 10)) {
            const card = validDebugCard(c);
            if (!card) continue;
            target.hand.push({ id: debugId++, ...card });
            given++;
          }
          if (given) {
            target.called = false;
            target.vulnerable = false;
            room.ev({ type: 'debug', player: target.id, n: given });
            room.afterAction(false);
          }
          return;
        }
        case 'ping':
          session.send({ t: 'pong', at: msg.at, now: Date.now() });
          return;
        default:
          if (session.room && session.player) session.room.handle(session.player, msg);
      }
    } catch (e) {
      if (e instanceof GameError) session.send({ t: 'error', msg: e.message });
      else console.error(e);
    }
  });

  ws.on('close', () => {
    if (session && session.ws === ws) {
      session.ws = null;
      session.lastSeen = Date.now();
      if (session.room && session.player) session.room.disconnected(session.player);
    }
  });
});

// Herzschlag & Aufräumen
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (!s.ws && now - s.lastSeen > 2 * 60 * 60 * 1000) {
      leaveRoom(s);
      sessions.delete(token);
    }
  }
  for (const room of rooms.values()) {
    if (room.connectedHumans().length) room.idleSince = null;
    else if (!room.idleSince) room.idleSince = now;
    else if (now - room.idleSince > 30 * 60 * 1000) room.destroy();
  }
}, 30_000);

server.listen(PORT, () => {
  console.log(`Farbwirbel läuft auf http://localhost:${PORT}  (statische Dateien: ${PUBLIC_DIR})${DEBUG ? '  [DEBUG-MODUS AN]' : ''}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); process.exit(0); });
