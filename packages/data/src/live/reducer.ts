/**
 * Bộ biến đổi trạng thái lớp trực tiếp — THUẦN (cùng đầu vào + `now` → cùng kết quả, không sửa đầu vào).
 * Máy GV áp dụng lệnh rồi đẩy toàn bộ trạng thái mới lên relay / Supabase Realtime.
 */
import type { Item, Lesson, LiveCommand, LiveState, LiveTeam } from '@openedu/contracts';
import { applyGains, emptyGame } from './game';

/** updatedAt luôn tăng ngặt (kể cả hai lệnh trong cùng một mili giây) để máy khác so sánh được. */
function nextStamp(prev: string | undefined, now: Date): string {
  const t = now.getTime();
  const p = prev ? Date.parse(prev) : NaN;
  return new Date(Number.isFinite(p) && p >= t ? p + 1 : t).toISOString();
}

function clampSlide(state: LiveState, i: number): number {
  const n = state.lesson?.slides.length;
  let x = Number.isFinite(i) ? Math.floor(i) : 0;
  if (x < 0) x = 0;
  if (typeof n === 'number' && n > 0 && x > n - 1) x = n - 1;
  return x;
}

export function applyLiveCommand(state: LiveState, cmd: LiveCommand, now: Date = new Date()): LiveState {
  const s: LiveState = { ...state };
  switch (cmd.type) {
    case 'go': {
      s.slideIndex = clampSlide(state, cmd.slideIndex);
      s.phase = 'slide';
      delete s.activeItemId;
      delete s.timerEndsAt;
      if (state.game) s.game = { ...state.game, board: false };
      break;
    }
    case 'open': {
      s.phase = 'activity-open';
      s.activeItemId = cmd.itemId;
      // Mở hoạt động = HS cần trả lời, nên mở khóa màn hình.
      s.locked = false;
      if (cmd.seconds && cmd.seconds > 0) s.timerEndsAt = new Date(now.getTime() + cmd.seconds * 1000).toISOString();
      else delete s.timerEndsAt;
      if (state.game) {
        const { lastGain: _l, ...g } = state.game;
        s.game = { ...g, board: false, openedAt: now.toISOString() };
      }
      break;
    }
    case 'close': {
      s.phase = 'activity-closed';
      delete s.timerEndsAt;
      break;
    }
    case 'reveal': {
      s.phase = 'reveal';
      delete s.timerEndsAt;
      break;
    }
    case 'lock': {
      s.locked = !!cmd.locked;
      break;
    }
    case 'award': {
      const stars = Number.isFinite(cmd.stars) ? cmd.stars : 0;
      if (cmd.target.kind === 'team') {
        s.teams = state.teams.map((t) => (t.id === cmd.target.id ? { ...t, stars: Math.max(0, t.stars + stars) } : t));
      } else {
        const prev = state.studentStars[cmd.target.id] ?? 0;
        s.studentStars = { ...state.studentStars, [cmd.target.id]: Math.max(0, prev + stars) };
      }
      break;
    }
    case 'set-teams': {
      const teams: LiveTeam[] = cmd.teams.map((t) => ({ ...t, stars: Number.isFinite(t.stars) ? t.stars : 0 }));
      const ids = new Set(teams.map((t) => t.id));
      s.teams = teams;
      s.participants = state.participants.map((p) => {
        if (!p.teamId || ids.has(p.teamId)) return p;
        const { teamId: _drop, ...rest } = p;
        return rest;
      });
      break;
    }
    case 'assign-team': {
      if (!state.teams.some((t) => t.id === cmd.teamId)) return state;
      s.participants = state.participants.map((p) => (p.userId === cmd.userId ? { ...p, teamId: cmd.teamId } : p));
      break;
    }
    case 'game-setup': {
      const g = cmd.game;
      if (!g || (g.mode !== 'class' && g.mode !== 'self' && g.mode !== 'paper')) return state;
      s.game = emptyGame(g.mode, g.seconds, g.cards);
      break;
    }
    case 'game-tally': {
      if (!state.game || !Array.isArray(cmd.gains)) return state;
      const next = applyGains(state.game, cmd.gains, cmd.slideIndex);
      if (next === state.game) return state;
      s.game = next;
      break;
    }
    case 'game-board': {
      if (!state.game) return state;
      s.game = { ...state.game, board: !!cmd.show };
      break;
    }
    case 'game-start': {
      if (!state.game) return state;
      s.game = { ...state.game, startedAt: now.toISOString(), ...(cmd.endsAt ? { endsAt: cmd.endsAt } : {}) };
      if (!cmd.endsAt) delete s.game.endsAt;
      s.phase = 'slide';
      s.locked = false;
      break;
    }
    case 'paper-answer': {
      if (!state.game || state.game.mode !== 'paper') return state;
      const k = String(cmd.slideIndex);
      const cur = { ...(state.game.paper?.[k] ?? {}) };
      for (const [u, v] of Object.entries(cmd.answers ?? {})) {
        if (v === null) delete cur[u];
        else if (v === 'A' || v === 'B' || v === 'C' || v === 'D') cur[u] = v;
      }
      s.game = { ...state.game, paper: { ...(state.game.paper ?? {}), [k]: cur } };
      break;
    }
    case 'end': {
      s.phase = 'ended';
      s.locked = false;
      delete s.timerEndsAt;
      break;
    }
    default:
      return state;
  }
  s.updatedAt = nextStamp(state.updatedAt, now);
  return s;
}

export function createInitialLiveState(init: {
  sessionId: string;
  pin: string;
  lesson?: Lesson;
  lessonId?: string;
  items?: Record<string, Item>;
  teams?: LiveTeam[];
  now?: Date;
}): LiveState {
  const lessonId = init.lesson?.id ?? init.lessonId ?? '';
  const st: LiveState = {
    sessionId: init.sessionId,
    pin: init.pin,
    lessonId,
    slideIndex: 0,
    phase: 'lobby',
    locked: false,
    teams: init.teams ?? [],
    participants: [],
    studentStars: {},
    updatedAt: (init.now ?? new Date()).toISOString(),
  };
  if (init.lesson) st.lesson = init.lesson;
  if (init.items) st.items = init.items;
  return st;
}

/** Ghép trạng thái mới nhận được: tin nhắn có thể bỏ `lesson`/`items` nghĩa là "không đổi". */
export function mergeIncomingState(prev: LiveState | null, incoming: LiveState): LiveState {
  if (!prev || prev.sessionId !== incoming.sessionId) return incoming;
  const out: LiveState = { ...incoming };
  if (out.lesson === undefined && prev.lesson !== undefined) out.lesson = prev.lesson;
  if (out.items === undefined && prev.items !== undefined) out.items = prev.items;
  return out;
}

/** 6 chữ số, không bắt đầu bằng 0 cho dễ đọc. */
export function randomPin(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}
