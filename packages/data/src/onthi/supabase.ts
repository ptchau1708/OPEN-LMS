/**
 * Ôn thi trên Supabase: mọi thao tác qua RPC onthi_* (migration 20261129000001_v2_on_thi.sql); nộp bài + chấm ở
 * Edge Function `grade` (action 'onthi-finalize'). Máy HS không nhận đáp án trước khi nộp.
 */
import type {
  DataSource,
  Item,
  ItemType,
  OnThiBest,
  OnThiBoard,
  OnThiCard,
  OnThiReport,
  OnThiResult,
  OnThiSavedAnswer,
  OnThiService,
  OnThiSession,
  OnThiSet,
  OnThiSetInput,
  OnThiStyle,
} from '@openedu/contracts';
import { ONTHI_GRACE_MS, ONTHI_PRACTICE_SIZE } from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { fromItem } from '../supabase/mapping';

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0) || 0;

function err(e: unknown, fallback: string): Error {
  const m = (e as { message?: string } | null)?.message;
  return Object.assign(new Error(m && /[à-ỹ]/i.test(m) ? m : fallback), { friendly: true });
}

export function fromSetJson(r: Row): OnThiSet {
  return {
    id: String(r.id), style: r.style as OnThiStyle, title: String(r.title ?? ''), grade: num(r.grade) as OnThiSet['grade'],
    subject: r.subject as OnThiSet['subject'], itemIds: ((r.itemIds ?? []) as unknown[]).map(String), minutes: num(r.minutes),
    points: num(r.points), passScore: num(r.passScore), lockOrder: !!r.lockOrder, position: num(r.position),
    showBoard: r.showBoard !== false, revealAnswers: r.revealAnswers !== false, status: (r.status as OnThiSet['status']) ?? 'published',
    ...(r.done !== undefined && r.done !== null ? { done: num(r.done) } : {}),
    ...(r.createdBy ? { createdBy: String(r.createdBy) } : {}), ...(r.createdByName ? { createdByName: String(r.createdByName) } : {}),
    ...(r.createdAt ? { createdAt: String(r.createdAt) } : {}), ...(r.updatedAt ? { updatedAt: String(r.updatedAt) } : {}),
  };
}

function fromBest(r: unknown): OnThiBest | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const b = r as Row;
  return { attemptId: String(b.attemptId), score: num(b.score), durationMs: num(b.durationMs), wrong: num(b.wrong), passed: !!b.passed, at: String(b.at ?? '') };
}

export function fromResultJson(r: Row): OnThiResult {
  return {
    attemptId: String(r.attemptId), setId: String(r.setId), style: r.style as OnThiStyle, title: String(r.title ?? ''),
    score: num(r.score), maxScore: num(r.maxScore), passScore: num(r.passScore), passed: !!r.passed, correct: num(r.correct),
    wrong: num(r.wrong), skipped: num(r.skipped), durationMs: num(r.durationMs), submittedAt: String(r.submittedAt ?? ''),
    items: ((r.items ?? []) as Row[]).map((x) => ({
      itemId: String(x.itemId), type: x.type as ItemType, answered: !!x.answered, correct: !!x.correct, earned: num(x.earned), points: num(x.points), ms: num(x.ms),
    })),
    responses: (r.responses ?? {}) as OnThiResult['responses'],
    ...(r.keys ? { keys: r.keys as Record<string, unknown> } : {}),
    best: num(r.best ?? r.score), newBest: !!r.newBest,
  };
}

export class SupabaseOnThiService implements OnThiService {
  constructor(private ds: DataSource) {}
  private db(): Promise<V2Client> {
    return getSupabaseClient();
  }
  private async rpc<T>(fn: string, args: Row, fallback: string): Promise<T> {
    const sb = await this.db();
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw err(error, fallback);
    return data as T;
  }
  private async finalize(attemptId: string): Promise<OnThiResult> {
    const sb = await this.db();
    const { data, error } = await sb.functions.invoke('grade', { body: { action: 'onthi-finalize', attemptId } });
    if (error) throw err(error, 'Chưa nộp được bài. Em kiểm tra mạng rồi bấm Nộp bài lần nữa nhé.');
    return fromResultJson(data as Row);
  }

  /* ---------------- thầy/cô ---------------- */
  async listSets(filter: { style?: OnThiStyle; grade?: number } = {}): Promise<OnThiSet[]> {
    const list = await this.rpc<Row[]>('onthi_sets_list', { p_style: filter.style ?? null, p_grade: filter.grade ?? null }, 'Chưa tải được bài luyện.');
    return (list ?? []).map(fromSetJson);
  }
  async saveSet(input: OnThiSetInput): Promise<OnThiSet> {
    return fromSetJson(await this.rpc<Row>('onthi_set_save', { p: input }, 'Chưa lưu được bài luyện.'));
  }
  async deleteSet(id: string): Promise<void> {
    await this.rpc('onthi_set_delete', { p_id: id }, 'Chưa xoá được bài luyện.');
  }
  async report(setId: string): Promise<OnThiReport> {
    const j = await this.rpc<Row>('onthi_report', { p_set: setId }, 'Chưa tải được kết quả.');
    return {
      set: fromSetJson(j.set as Row),
      students: ((j.students ?? []) as Row[]).map((r) => {
        const best = fromBest(r.best);
        return {
          studentId: String(r.studentId), name: String(r.name ?? ''), ...(r.classId ? { classId: String(r.classId) } : {}),
          ...(r.className ? { className: String(r.className) } : {}), attempts: num(r.attempts), ...(best ? { best } : {}),
        };
      }),
      items: ((j.items ?? []) as Row[]).map((r) => ({ itemId: String(r.itemId), type: r.type as ItemType, tried: num(r.tried), correct: num(r.correct) })),
    };
  }

  /* ---------------- học sinh ---------------- */
  async myCards(style: OnThiStyle): Promise<OnThiCard[]> {
    let list = await this.rpc<Row[]>('onthi_my_cards', { p_style: style }, 'Chưa tải được bài luyện.');
    // Lần đang làm đã quá giờ → nộp hộ (server chấm) rồi tải lại.
    const stale = (list ?? []).map((c) => c.inProgress as Row | undefined).filter((p): p is Row => !!p && Date.parse(String(p.deadlineAt)) + ONTHI_GRACE_MS < Date.now());
    if (stale.length) {
      await Promise.all(stale.map((p) => this.finalize(String(p.attemptId)).catch(() => undefined)));
      list = await this.rpc<Row[]>('onthi_my_cards', { p_style: style }, 'Chưa tải được bài luyện.');
    }
    return (list ?? []).map((c) => {
      const best = fromBest(c.best);
      const ip = c.inProgress as Row | undefined;
      return {
        setId: String(c.setId), style: c.style as OnThiStyle, title: String(c.title ?? ''), subject: c.subject as OnThiCard['subject'], grade: num(c.grade) as OnThiCard['grade'],
        questions: num(c.questions), minutes: num(c.minutes), points: num(c.points), maxScore: num(c.maxScore), passScore: num(c.passScore),
        position: num(c.position), showBoard: c.showBoard !== false, locked: !!c.locked, ...(c.lockedBy ? { lockedBy: String(c.lockedBy) } : {}),
        attempts: num(c.attempts), ...(best ? { best } : {}), ...(ip ? { inProgress: { attemptId: String(ip.attemptId), deadlineAt: String(ip.deadlineAt) } } : {}),
      };
    });
  }
  async start(setId: string): Promise<OnThiSession> {
    let j = await this.rpc<Row>('onthi_start', { p_set: setId }, 'Chưa mở được bài luyện.');
    if (j.overdueAttemptId) {
      await this.finalize(String(j.overdueAttemptId));
      j = await this.rpc<Row>('onthi_start', { p_set: setId }, 'Chưa mở được bài luyện.');
    }
    return {
      attemptId: String(j.attemptId), setId: String(j.setId), style: j.style as OnThiStyle, title: String(j.title ?? ''), minutes: num(j.minutes),
      points: num(j.points), maxScore: num(j.maxScore), passScore: num(j.passScore), startedAt: String(j.startedAt), deadlineAt: String(j.deadlineAt),
      serverNow: String(j.serverNow), items: ((j.items ?? []) as Row[]).map(fromItem), answers: (j.answers ?? {}) as Record<string, OnThiSavedAnswer>,
    };
  }
  async saveAnswer(attemptId: string, itemId: string, a: OnThiSavedAnswer): Promise<void> {
    await this.rpc('onthi_save_answer', { p_attempt: attemptId, p_item: itemId, p_response: a.response ?? null, p_ms: Math.round(a.ms) }, 'Chưa lưu được câu trả lời.');
  }
  async submit(attemptId: string): Promise<OnThiResult> {
    return this.finalize(attemptId);
  }
  async result(attemptId: string): Promise<OnThiResult> {
    return fromResultJson(await this.rpc<Row>('onthi_result', { p_attempt: attemptId }, 'Chưa tải được kết quả.'));
  }
  async board(setId: string): Promise<OnThiBoard> {
    const j = await this.rpc<Row>('onthi_board', { p_set: setId }, 'Chưa tải được bảng xếp hạng.');
    const row = (r: Row) => ({
      rank: num(r.rank), studentId: String(r.studentId), name: String(r.name ?? ''), ...(r.className ? { className: String(r.className) } : {}),
      ...(r.mascot ? { mascot: String(r.mascot) } : {}), ...(r.color ? { color: String(r.color) } : {}), score: num(r.score), durationMs: num(r.durationMs), wrong: num(r.wrong),
    });
    return { setId: String(j.setId ?? setId), total: num(j.total), rows: ((j.rows ?? []) as Row[]).map(row), me: j.me ? row(j.me as Row) : null, ...(j.hidden ? { hidden: true } : {}) };
  }
  async practiceTypes(style: OnThiStyle): Promise<{ type: ItemType; count: number }[]> {
    const list = await this.rpc<Row[]>('onthi_practice_types', { p_style: style }, 'Chưa tải được dạng câu.');
    return (list ?? []).map((r) => ({ type: r.type as ItemType, count: num(r.count) }));
  }
  async practiceItems(style: OnThiStyle, type: ItemType): Promise<Item[]> {
    const list = await this.rpc<Row[]>('onthi_practice_items', { p_style: style, p_type: type, p_limit: ONTHI_PRACTICE_SIZE }, 'Chưa tải được câu luyện.');
    void this.ds;
    return (list ?? []).map(fromItem);
  }
}
