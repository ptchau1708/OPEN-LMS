#!/usr/bin/env node
/**
 * OPEN-EDU live-relay — máy chủ phòng học trực tiếp "ngốc" cho chế độ demo / mạng LAN.
 * Không chấm điểm, không xử lý lệnh: chỉ giữ trạng thái mới nhất của phòng và chuyển tin.
 *
 * HTTP:  GET /health · GET /pin/:pin → { sessionId, pin, lessonId, lessonTitle } hoặc 404
 * WS (JSON, trường `t`):
 *   khách → máy chủ: create{state} · join-room{sessionId, role, participant?} · state{state} · respond{response}
 *   máy chủ → khách: state{state} · response{response} · presence{participants} · responses{list} · error{message, code?}
 * Tin `state` gửi đi khi đổi trạng thái không kèm `lesson`/`items` (khách đã có từ lúc vào phòng).
 */
import http from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const ROLES = new Set(['teacher', 'screen', 'student']);

function slim(state) {
  if (!state) return state;
  const { lesson: _l, items: _i, ...rest } = state;
  return rest;
}

function respKey(r) {
  return `${r.userId}|${r.itemId}|${r.slideIndex}`;
}

/** Địa chỉ IPv4 trong mạng LAN của máy này. */
export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
    }
  }
  return out;
}

/**
 * Khởi động relay. Trả về { port, close(), rooms } khi đã lắng nghe.
 * @param {{ port?: number, host?: string, idleMs?: number, quiet?: boolean }} [opts]
 */
export function startRelay(opts = {}) {
  const port = opts.port ?? (Number(process.env.PORT) || 8787);
  const host = opts.host ?? '0.0.0.0';
  const idleMs = opts.idleMs ?? SIX_HOURS;
  const log = opts.quiet ? () => {} : (...a) => console.log(new Date().toLocaleTimeString('vi-VN'), ...a);
  const startedAt = Date.now();

  /** sessionId → room */
  const rooms = new Map();
  /** pin → sessionId */
  const pins = new Map();

  /* ---------------- HTTP ---------------- */
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  function sendJson(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
    res.end(JSON.stringify(body));
  }
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://relay');
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, rooms: rooms.size, clients: wss.clients.size, uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
      return;
    }
    const m = /^\/pin\/(\d{6})\/?$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const sid = pins.get(m[1]);
      const room = sid ? rooms.get(sid) : undefined;
      if (!room || room.state?.phase === 'ended') {
        sendJson(res, 404, { error: 'Không tìm thấy lớp học với mã này.' });
        return;
      }
      sendJson(res, 200, {
        sessionId: room.sessionId,
        pin: room.pin,
        lessonId: room.state.lessonId ?? '',
        lessonTitle: room.state.lesson?.title ?? '',
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...cors });
      res.end('OPEN-EDU live-relay đang chạy. Kết nối WebSocket tới địa chỉ này để vào lớp học trực tiếp.\n');
      return;
    }
    sendJson(res, 404, { error: 'Không có đường dẫn này.' });
  });

  /* ---------------- WebSocket ---------------- */
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 * 1024 });

  function send(ws, msg) {
    if (ws.readyState === 1) {
      try {
        ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
      } catch {
        /* bỏ qua */
      }
    }
  }
  function broadcast(room, msg, { except, roles } = {}) {
    const data = JSON.stringify(msg);
    for (const ws of room.members) {
      if (ws === except) continue;
      if (roles && !roles.has(ws.oeRole)) continue;
      send(ws, data);
    }
  }
  function onlineList(room) {
    return [...room.online.values()].map((o) => o.participant);
  }
  function touch(room) {
    room.lastActive = Date.now();
  }
  function attach(ws, room, role) {
    if (ws.oeRoom && ws.oeRoom !== room.sessionId) detach(ws);
    ws.oeRoom = room.sessionId;
    ws.oeRole = role;
    room.members.add(ws);
  }
  function detach(ws) {
    const room = rooms.get(ws.oeRoom);
    ws.oeRoom = undefined;
    if (!room) return;
    room.members.delete(ws);
    if (ws.oeUserId) {
      const o = room.online.get(ws.oeUserId);
      if (o) {
        o.count -= 1;
        if (o.count <= 0) room.online.delete(ws.oeUserId);
      }
      ws.oeUserId = undefined;
      broadcast(room, { t: 'presence', participants: onlineList(room) });
    }
  }
  function validState(s) {
    return s && typeof s === 'object' && typeof s.sessionId === 'string' && s.sessionId && /^\d{6}$/.test(String(s.pin ?? ''));
  }
  /** Ghép HS: giữ HS mà máy chủ đã biết nhưng bản của GV chưa có (vào cùng lúc GV bấm lệnh). */
  function mergeParticipants(incoming, known) {
    const list = Array.isArray(incoming) ? [...incoming] : [];
    const ids = new Set(list.map((p) => p.userId));
    let added = false;
    for (const p of known ?? []) {
      if (!ids.has(p.userId)) {
        list.push(p);
        added = true;
      }
    }
    return { list, added };
  }

  function handleCreate(ws, msg) {
    const st = msg.state;
    if (!validState(st)) return send(ws, { t: 'error', message: 'Trạng thái phòng không hợp lệ (thiếu sessionId hoặc mã 6 số).' });
    let room = rooms.get(st.sessionId);
    if (room) {
      const { list } = mergeParticipants(st.participants, room.state?.participants);
      room.state = {
        ...st,
        participants: list,
        lesson: st.lesson ?? room.state?.lesson,
        items: st.items ?? room.state?.items,
      };
      if (room.pin !== st.pin) {
        if (pins.get(room.pin) === room.sessionId) pins.delete(room.pin);
        room.pin = st.pin;
      }
    } else {
      room = { sessionId: st.sessionId, pin: st.pin, state: { ...st, participants: st.participants ?? [] }, responses: [], members: new Set(), online: new Map(), lastActive: Date.now() };
      rooms.set(room.sessionId, room);
      log(`Mở phòng ${room.pin} — ${st.lesson?.title ?? st.lessonId ?? ''}`);
    }
    pins.set(room.pin, room.sessionId);
    touch(room);
    attach(ws, room, 'teacher');
    send(ws, { t: 'state', state: room.state });
    send(ws, { t: 'responses', list: room.responses });
    send(ws, { t: 'presence', participants: onlineList(room) });
    broadcast(room, { t: 'state', state: room.state }, { except: ws });
  }

  function handleJoin(ws, msg) {
    const room = rooms.get(msg.sessionId);
    if (!room) return send(ws, { t: 'error', code: 'no-room', message: 'Không tìm thấy lớp học trực tiếp này. Có thể lớp đã kết thúc hoặc máy chủ vừa khởi động lại.' });
    const role = ROLES.has(msg.role) ? msg.role : 'student';
    attach(ws, room, role);
    touch(room);
    const p = msg.participant;
    let changed = false;
    if (role === 'student' && p && typeof p.userId === 'string' && p.userId) {
      const parts = Array.isArray(room.state.participants) ? room.state.participants : [];
      const i = parts.findIndex((x) => x.userId === p.userId);
      const merged = i >= 0 ? { ...parts[i], ...p, teamId: p.teamId ?? parts[i].teamId } : { ...p };
      if (!merged.teamId) delete merged.teamId;
      const next = [...parts];
      if (i >= 0) next[i] = merged;
      else next.push(merged);
      room.state = { ...room.state, participants: next };
      if (ws.oeUserId !== p.userId) {
        if (ws.oeUserId) {
          const old = room.online.get(ws.oeUserId);
          if (old && --old.count <= 0) room.online.delete(ws.oeUserId);
        }
        ws.oeUserId = p.userId;
        const o = room.online.get(p.userId);
        room.online.set(p.userId, { participant: merged, count: (o?.count ?? 0) + 1 });
      } else {
        const o = room.online.get(p.userId);
        room.online.set(p.userId, { participant: merged, count: o?.count ?? 1 });
      }
      changed = true;
    }
    send(ws, { t: 'state', state: room.state });
    const list = role === 'student' ? room.responses.filter((r) => p && r.userId === p.userId) : room.responses;
    send(ws, { t: 'responses', list });
    send(ws, { t: 'presence', participants: onlineList(room) });
    if (changed) {
      broadcast(room, { t: 'state', state: slim(room.state) }, { except: ws });
      broadcast(room, { t: 'presence', participants: onlineList(room) }, { except: ws });
      log(`Phòng ${room.pin}: ${p.name ?? p.userId} vào lớp (${room.online.size} đang kết nối)`);
    }
  }

  function handleState(ws, msg) {
    if (ws.oeRole !== 'teacher') return send(ws, { t: 'error', message: 'Chỉ máy giáo viên mới được đổi trạng thái lớp.' });
    const st = msg.state;
    if (!validState(st)) return send(ws, { t: 'error', message: 'Trạng thái phòng không hợp lệ.' });
    const room = rooms.get(st.sessionId);
    if (!room) return send(ws, { t: 'error', code: 'no-room', message: 'Phòng không còn trên máy chủ.' });
    if (ws.oeRoom !== room.sessionId) attach(ws, room, 'teacher');
    const { list, added } = mergeParticipants(st.participants, room.state?.participants);
    room.state = { ...st, participants: list, lesson: st.lesson ?? room.state?.lesson, items: st.items ?? room.state?.items };
    touch(room);
    const out = { t: 'state', state: slim(room.state) };
    broadcast(room, out, { except: ws });
    if (added) send(ws, out);
    if (room.state.phase === 'ended') log(`Phòng ${room.pin} kết thúc.`);
  }

  const VIEWERS = new Set(['teacher', 'screen']);
  function handleRespond(ws, msg) {
    const r = msg.response;
    const room = rooms.get(ws.oeRoom);
    if (!room) return send(ws, { t: 'error', code: 'no-room', message: 'Em chưa vào lớp học trực tiếp nào.' });
    if (!r || typeof r !== 'object' || typeof r.userId !== 'string' || typeof r.itemId !== 'string') {
      return send(ws, { t: 'error', message: 'Câu trả lời không hợp lệ.' });
    }
    const response = { ...r, sessionId: room.sessionId, at: typeof r.at === 'string' ? r.at : new Date().toISOString() };
    const k = respKey(response);
    room.responses = room.responses.filter((x) => respKey(x) !== k);
    room.responses.push(response);
    if (room.responses.length > 5000) room.responses.splice(0, room.responses.length - 5000);
    touch(room);
    broadcast(room, { t: 'response', response }, { except: ws, roles: VIEWERS });
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return send(ws, { t: 'error', message: 'Tin nhắn không phải JSON.' });
      }
      try {
        switch (msg?.t) {
          case 'create':
            return handleCreate(ws, msg);
          case 'join-room':
            return handleJoin(ws, msg);
          case 'state':
            return handleState(ws, msg);
          case 'respond':
            return handleRespond(ws, msg);
          default:
            return send(ws, { t: 'error', message: `Không hiểu lệnh: ${String(msg?.t)}` });
        }
      } catch (e) {
        send(ws, { t: 'error', message: `Lỗi máy chủ: ${e?.message ?? e}` });
      }
    });
    ws.on('close', () => detach(ws));
    ws.on('error', () => {});
  });

  // Ngắt kết nối "chết" (máy tính bảng tắt màn hình, rớt Wi-Fi).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* bỏ qua */
      }
    }
  }, 30_000);

  // Bỏ phòng không hoạt động quá 6 giờ.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (now - room.lastActive > idleMs) {
        rooms.delete(room.sessionId);
        if (pins.get(room.pin) === room.sessionId) pins.delete(room.pin);
        log(`Dọn phòng ${room.pin} (không hoạt động).`);
      }
    }
  }, Math.min(10 * 60 * 1000, Math.max(1000, idleMs / 2)));
  heartbeat.unref?.();
  sweep.unref?.();

  function close() {
    clearInterval(heartbeat);
    clearInterval(sweep);
    for (const ws of wss.clients) ws.terminate();
    return new Promise((resolve) => {
      wss.close(() => server.close(() => resolve()));
    });
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const realPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: realPort, close, rooms, server });
    });
  });
}

/* ---------------- chạy trực tiếp: node tools/live-relay/server.mjs ---------------- */
const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  startRelay()
    .then(({ port }) => {
      const ips = lanAddresses();
      console.log('');
      console.log('  OPEN-EDU live-relay đã chạy ✔');
      console.log(`  Máy chủ lớp học: ws://localhost:${port}  (kiểm tra: http://localhost:${port}/health)`);
      if (ips.length) {
        for (const ip of ips) {
          console.log(`  Máy học sinh trong cùng Wi-Fi mở: http://${ip}:5173`);
        }
        console.log(`  (Relay cho máy khác trong mạng: ws://${ips[0]}:${port})`);
      } else {
        console.log('  Chưa thấy địa chỉ mạng LAN — hãy kết nối Wi-Fi để máy học sinh vào được.');
      }
      console.log('  Nhấn Ctrl+C để dừng.');
      console.log('');
    })
    .catch((e) => {
      if (e?.code === 'EADDRINUSE') {
        console.error(`Cổng ${process.env.PORT || 8787} đang được dùng — có thể relay đã chạy rồi. Đổi cổng: PORT=8788 node tools/live-relay/server.mjs`);
      } else {
        console.error('Không khởi động được relay:', e?.message ?? e);
      }
      process.exit(1);
    });
}
