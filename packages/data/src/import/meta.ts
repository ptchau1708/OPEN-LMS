/**
 * Môn, lớp, kĩ năng khi nhập câu hỏi — dùng chung cho mẫu Excel, mẫu Word ("Dạng: …") và văn bản dán.
 *  - parseSubject / parseGrade / parseSkills: đọc giá trị một ô / một dòng "Môn: …", "Lớp: …", "Mã kĩ năng: …".
 *  - detectDocMeta: đọc phần đầu đề (tiêu đề, dòng "Môn: …", "Lớp 5", "ĐỀ … MÔN TOÁN LỚP 3", "Tiếng Việt 4"…)
 *    → môn, lớp, kĩ năng chung cho cả đề.
 * Thuần, không ném lỗi.
 */
import { SKILL_BY_CODE, SKILLS, SUBJECTS, type Grade, type ItemBase, type Skill, type SubjectId } from '@openedu/contracts';
import { foldVietnamese } from '../text';

const fold = (s: string): string => foldVietnamese(String(s ?? '')).replace(/[():*]/g, ' ').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();

const SUBJECT_ALIAS: Record<string, SubjectId> = {
  'tu nhien xa hoi': 'tnxh', 'tu nhien va xa hoi': 'tnxh', tnxh: 'tnxh', 'tn xh': 'tnxh', 'tn&xh': 'tnxh',
  'tieng viet': 'tieng-viet', tv: 'tieng-viet', 'tieng anh': 'tieng-anh', ta: 'tieng-anh', 'anh van': 'tieng-anh', 'ngoai ngu': 'tieng-anh', 'ngoai ngu 1': 'tieng-anh',
  'my thuat': 'mi-thuat', 'khoa hoc': 'khoa-hoc', kh: 'khoa-hoc', 'am nhac': 'am-nhac', nhac: 'am-nhac',
  'dao duc': 'dao-duc', dd: 'dao-duc',
  'lich su va dia li': 'lich-su-dia-li', 'lich su dia li': 'lich-su-dia-li', 'lich su & dia li': 'lich-su-dia-li', 'lich su va dia ly': 'lich-su-dia-li',
  'lich su dia ly': 'lich-su-dia-li', 'ls&dl': 'lich-su-dia-li', 'ls dl': 'lich-su-dia-li', lsdl: 'lich-su-dia-li', 'lich su': 'lich-su-dia-li', 'dia li': 'lich-su-dia-li', 'dia ly': 'lich-su-dia-li',
  'tin hoc': 'tin-hoc', tin: 'tin-hoc', 'tin hoc va cong nghe': 'tin-hoc', 'tin hoc & cong nghe': 'tin-hoc',
  'cong nghe': 'cong-nghe', cn: 'cong-nghe',
  'giao duc the chat': 'gdtc', gdtc: 'gdtc', 'the duc': 'gdtc',
  'hoat dong trai nghiem': 'hdtn', hdtn: 'hdtn', 'trai nghiem': 'hdtn',
  'tieng dan toc thieu so': 'tieng-dan-toc', 'tieng dan toc': 'tieng-dan-toc', 'dan toc': 'tieng-dan-toc', tdt: 'tieng-dan-toc',
  'tieng khmer': 'tieng-dan-toc', 'tieng mong': 'tieng-dan-toc', 'tieng thai': 'tieng-dan-toc', 'tieng cham': 'tieng-dan-toc', 'tieng jrai': 'tieng-dan-toc', 'tieng bahnar': 'tieng-dan-toc', 'tieng ede': 'tieng-dan-toc',
};

export function parseSubject(v: string): SubjectId | undefined {
  const f = fold(v);
  if (!f) return undefined;
  const hit = Object.values(SUBJECTS).find((s) => s.id === f || fold(s.name) === f || fold(s.id) === f);
  if (hit) return hit.id;
  return SUBJECT_ALIAS[f] ?? SUBJECT_ALIAS[f.replace(/\s*&\s*/g, ' va ')];
}

export function parseDifficulty(v: string): ItemBase['difficulty'] | undefined {
  const f = fold(v);
  if (!f) return undefined;
  if (['nhan biet', 'nb', '1', 'm1', 'muc 1', 'de', 'nhan-biet'].includes(f)) return 'nhan-biet';
  if (['ket noi', 'thong hieu', 'th', 'kn', '2', 'm2', 'muc 2', 'trung binh', 'tb', 'vua'].includes(f)) return 'ket-noi';
  if (['van dung', 'vd', 'van dung cao', 'vdc', '3', 'm3', 'muc 3', '4', 'm4', 'muc 4', 'kho', 'nang cao'].includes(f)) return 'van-dung';
  return undefined;
}

export function parseGrade(v: string): Grade | undefined {
  const m = String(v ?? '').match(/[1-5]/);
  const f = fold(v);
  if (!m || !/^(?:lop |khoi )?[1-5](?:\.0+)?$/.test(f)) return undefined;
  return Number(m[0]) as Grade;
}

/* ---------------- kĩ năng: mã, "mã – nội dung", hoặc đúng tên / nội dung yêu cầu cần đạt ---------------- */
const CODE_IN = /(?:^|[^A-Za-z0-9.-])([A-Za-z]{1,6}[1-5]\.[A-Za-z0-9-]+\.[A-Za-z0-9-]+)(?![A-Za-z0-9-])/;

function codeHit(c: string): string | undefined {
  const t = c.trim();
  if (!t) return undefined;
  if (SKILL_BY_CODE[t]) return t;
  const up = t.toUpperCase();
  if (SKILL_BY_CODE[up]) return up;
  return undefined;
}

const normText = (s: string): string => fold(s).replace(/[.;,!?…"“”'‘’]+/g, ' ').replace(/\s+/g, ' ').trim();

function textHit(t: string, ctx?: { subject?: SubjectId; grade?: Grade }): string | undefined {
  const f = normText(t);
  if (f.length < 4) return undefined;
  const all = Object.values(SKILL_BY_CODE) as Skill[];
  const visible = new Set(SKILLS.map((s) => s.code));
  const near = (s: Skill): boolean => (!ctx?.subject || s.subject === ctx.subject) && (!ctx?.grade || s.grade === ctx.grade);
  const eq = (s: Skill): boolean => normText(s.short) === f || normText(s.text) === f;
  for (const pool of [all.filter((s) => near(s) && visible.has(s.code)), all.filter(near), all.filter((s) => visible.has(s.code)), all]) {
    const hits = [...new Set(pool.filter(eq).map((s) => s.code))];
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return undefined; // trùng tên ở nhiều lớp / môn → để GV chọn
  }
  return undefined;
}

/** Một kĩ năng: mã ("T4.PS.RUT-GON"), "mã – nội dung", "nội dung (mã)", hoặc đúng tên ngắn / nội dung. */
export function resolveSkill(v: string, ctx?: { subject?: SubjectId; grade?: Grade }): string | undefined {
  const t = String(v ?? '').trim();
  if (!t) return undefined;
  const direct = codeHit(t);
  if (direct) return direct;
  const m = t.match(CODE_IN);
  if (m) {
    const c = codeHit(m[1]);
    if (c) return c;
  }
  return textHit(t, ctx);
}

/**
 * Ô / dòng "Mã kĩ năng". Nhiều kĩ năng ngăn bằng dấu ; hoặc xuống dòng (dấu phẩy cũng được khi ghi mã).
 * ctx (môn, lớp của câu) giúp nhận đúng kĩ năng khi GV ghi tên thay vì mã.
 */
export function parseSkills(v: string, ctx?: { subject?: SubjectId; grade?: Grade }): { codes: string[]; unknown: string[] } {
  const codes: string[] = [];
  const unknown: string[] = [];
  const add = (c: string): void => { if (!codes.includes(c)) codes.push(c); };
  const raw = String(v ?? '').trim();
  if (!raw) return { codes, unknown };
  // Cả ô đúng bằng tên / nội dung một kĩ năng (nội dung có thể chứa dấu phẩy, chấm phẩy).
  const whole = textHit(raw, ctx);
  if (whole) return { codes: [whole], unknown };
  for (const part of raw.split(/[;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    if (!p.includes(',')) {
      const hit = resolveSkill(p, ctx);
      if (hit) add(hit);
      else unknown.push(p);
      continue;
    }
    // Dấu phẩy: nhiều mã / tên ngăn bằng dấu phẩy, hoặc là một phần của tên kĩ năng.
    const bits = p.split(',').map((x) => x.trim()).filter(Boolean);
    const each = bits.map((b) => resolveSkill(b, ctx));
    if (each.some(Boolean)) bits.forEach((b, i) => (each[i] ? add(each[i]!) : unknown.push(b)));
    else {
      const t = textHit(p, ctx);
      if (t) add(t);
      else unknown.push(p);
    }
  }
  return { codes, unknown };
}

/* ---------------- phần đầu đề: môn, lớp, kĩ năng chung ---------------- */
export interface DocMeta {
  subject?: SubjectId;
  grade?: Grade;
  skills?: string[];
  /** Kĩ năng ghi ở đầu đề mà không có trong danh mục. */
  unknownSkills?: string[];
  /** Dòng đầu đề đã dùng (để không coi là bài đọc). */
  used: number[];
}

/** Tên môn trong một dòng chữ (đã gấp dấu, chữ thường). Tên dài trước, tên một từ ("toán") chỉ khi có ngữ cảnh. */
const SUBJECT_PHRASES: [string, SubjectId][] = (() => {
  const list: [string, SubjectId][] = [
    ['tu nhien va xa hoi', 'tnxh'], ['tu nhien xa hoi', 'tnxh'], ['tn&xh', 'tnxh'], ['tnxh', 'tnxh'],
    ['lich su va dia li', 'lich-su-dia-li'], ['lich su va dia ly', 'lich-su-dia-li'], ['lich su & dia li', 'lich-su-dia-li'], ['lich su - dia li', 'lich-su-dia-li'],
    ['lich su dia li', 'lich-su-dia-li'], ['lich su dia ly', 'lich-su-dia-li'], ['ls&dl', 'lich-su-dia-li'],
    ['tin hoc va cong nghe', 'tin-hoc'], ['tieng dan toc thieu so', 'tieng-dan-toc'], ['tieng dan toc', 'tieng-dan-toc'],
    ['hoat dong trai nghiem', 'hdtn'], ['giao duc the chat', 'gdtc'],
    ['tieng viet', 'tieng-viet'], ['tieng anh', 'tieng-anh'], ['ngoai ngu', 'tieng-anh'], ['dao duc', 'dao-duc'],
    ['khoa hoc', 'khoa-hoc'], ['tin hoc', 'tin-hoc'], ['cong nghe', 'cong-nghe'], ['am nhac', 'am-nhac'], ['mi thuat', 'mi-thuat'], ['my thuat', 'mi-thuat'],
    ['tieng khmer', 'tieng-dan-toc'], ['tieng mong', 'tieng-dan-toc'], ['tieng cham', 'tieng-dan-toc'], ['tieng ede', 'tieng-dan-toc'], ['tieng jrai', 'tieng-dan-toc'], ['tieng bahnar', 'tieng-dan-toc'],
  ];
  return list.sort((a, b) => b[0].length - a[0].length);
})();

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&');

function phraseSubject(f: string, strong: boolean): SubjectId | undefined {
  for (const [p, id] of SUBJECT_PHRASES) {
    if (new RegExp(`(?:^|[^a-z])${esc(p).replace(/ /g, '\\s*')}(?![a-z])`).test(f)) return id;
  }
  // "toán" chỉ nhận khi có ngữ cảnh rõ: "môn toán", "toán lớp 3", "toán 3", hoặc cả dòng là tiêu đề.
  if (/(?:^|[^a-z])mon\s+toan(?![a-z])|(?:^|[^a-z])toan\s+(?:lop\s*)?[1-5](?![0-9])/.test(f)) return 'toan';
  if (strong && /(?:^|[^a-z])toan(?![a-z])/.test(f) && !/bai toan|phep toan|tinh toan/.test(f)) return 'toan';
  return undefined;
}

const NUM_WORD: Record<string, Grade> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5 };
function phraseGrade(f: string): Grade | undefined {
  const m = f.match(/(?:^|[^a-z])(?:lop|khoi)\s*:?\s*([1-5])(?:[a-z]\d*)?(?![0-9])/) ?? f.match(/(?:^|[^a-z])(?:lop|khoi)\s+(mot|hai|ba|bon|nam)(?![a-z])/);
  if (m) return (/^\d$/.test(m[1]) ? Number(m[1]) : NUM_WORD[m[1]]) as Grade;
  return undefined;
}
/** Tên sách / môn kèm số lớp: "Toán 3", "Tiếng Việt 4", "Khoa học 5". */
function subjectNumberGrade(f: string): Grade | undefined {
  for (const p of [...SUBJECT_PHRASES.map((x) => x[0]), 'toan']) {
    const m = f.match(new RegExp(`(?:^|[^a-z])${esc(p).replace(/ /g, '\\s*')}\\s+(?:tap\\s+\\d\\s+)?([1-5])(?![0-9.,])`));
    if (m) return Number(m[1]) as Grade;
  }
  return undefined;
}

const FIELD = /^(môn(?:\s*học)?|lớp|khối(?:\s*lớp)?|mã\s*k[iỹĩy]\s*năng|k[iỹĩy]\s*năng|yccđ|mã\s*yccđ)\s*[:：]\s*(.+)$/i;

/**
 * Đọc môn / lớp / kĩ năng ở PHẦN ĐẦU đề (trước câu 1). Chỉ xét ~12 dòng đầu, bỏ qua đoạn bài đọc dài.
 *  - dòng khai báo: "Môn: Lịch sử và Địa lí", "Lớp: 5", "Mã kĩ năng: LSDL5.…" (ưu tiên cao nhất)
 *  - tiêu đề: "ĐỀ KIỂM TRA CUỐI KÌ I – MÔN TIẾNG VIỆT – LỚP 4", "Phiếu bài tập Toán 3", "Đố vui Lịch sử và Địa lí lớp 5"
 */
export function detectDocMeta(lines: string[]): DocMeta {
  const out: DocMeta = { used: [] };
  let seen = 0;
  for (let i = 0; i < lines.length && seen < 12; i++) {
    const l = (lines[i] ?? '').trim();
    if (!l) continue;
    seen++;
    const fd = l.match(FIELD);
    if (fd) {
      const key = fold(fd[1]);
      const val = fd[2].trim();
      if (key.startsWith('mon')) {
        const s = parseSubject(val) ?? phraseSubject(fold(val), true);
        if (s) out.subject = s;
        const g = phraseGrade(fold(val));
        if (g && !out.grade) out.grade = g;
      } else if (key.startsWith('lop') || key.startsWith('khoi')) {
        const g = parseGrade(val) ?? phraseGrade(`lop ${fold(val)}`);
        if (g) out.grade = g;
      } else {
        const sk = parseSkills(val, { subject: out.subject, grade: out.grade });
        if (sk.codes.length) out.skills = [...(out.skills ?? []), ...sk.codes];
        if (sk.unknown.length) out.unknownSkills = [...(out.unknownSkills ?? []), ...sk.unknown];
      }
      out.used.push(i);
      continue;
    }
    // Đoạn dài (bài đọc) — không phải tiêu đề.
    if (l.length > 140) continue;
    const f = fold(l).replace(/[–—]/g, '-');
    const letters = l.replace(/[^A-Za-zÀ-ỹ]/g, '');
    const upper = letters.length >= 6 && letters === letters.toUpperCase();
    const g = phraseGrade(f) ?? subjectNumberGrade(f);
    const s = phraseSubject(f, upper || !!g || /(?:^|[^a-z])mon(?![a-z])/.test(f));
    // Tên môn chỉ nhận ở dòng giống tiêu đề: chữ in hoa, có "môn", có "lớp N", hoặc là một trong 3 dòng đầu và ngắn.
    const titleish = upper || !!g || /(?:^|[^a-z])mon(?![a-z])/.test(f) || (seen <= 3 && l.length <= 90);
    let hit = false;
    if (s && titleish && !out.subject) { out.subject = s; hit = true; }
    if (g && !out.grade && (titleish || s)) { out.grade = g; hit = true; }
    if (hit) out.used.push(i);
  }
  if (out.skills) out.skills = [...new Set(out.skills)];
  return out;
}

/** Lớp gần nhất mà môn có dạy (môn mới nhận ra không thuộc lớp mặc định). */
export function nearestGradeFor(subject: SubjectId, prefer: Grade): Grade {
  const gs = (SUBJECTS[subject]?.grades ?? []) as Grade[];
  if (!gs.length || gs.includes(prefer)) return prefer;
  return [...gs].sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer))[0]!;
}
