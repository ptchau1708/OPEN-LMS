/**
 * Đọc đề dạng VĂN BẢN (dán từ Word / PDF / Zalo) thành câu hỏi nháp — THUẦN, không bao giờ ném lỗi.
 *
 * Nhận ra:
 *  - đầu câu: "Câu 1:", "Câu 1.", "Câu 1 (1 điểm):", "Bài 1", "1.", "1)", "1/ …"
 *  - lựa chọn: "A.", "A)", "a/", "(A)"; nhiều lựa chọn trên một dòng ("A. 5   B. 6   C. 7   D. 8"), kể cả nằm cùng dòng với đề
 *  - đáp án: dòng "Đáp án: B", "ĐA: B", "Chọn B", "Đáp số: 25 cm"; dấu * / (đúng) / ✓ ở lựa chọn;
 *    bảng đáp án cuối đề ("1.B 2.C 3.A", "1-B, 2-C", hai dòng "Câu 1 2 3" / "Đáp án B C A", hoặc sau tiêu đề "ĐÁP ÁN")
 *  - "Gợi ý:", "Giải thích:" / "Lời giải:"
 *  - Đúng – Sai: "Đúng ghi Đ, sai ghi S" + các ý a) b) c) → mỗi ý một câu chọn Đúng / Sai
 *  - câu không có lựa chọn → Điền đáp án (có đáp án nếu đề ghi, không thì "thiếu đáp án")
 *  - khối không hiểu được → giữ nguyên chữ, đánh dấu "cần xem lại"
 */
import type { Item, ItemBase } from '@openedu/contracts';
import { promptKey } from './dedupe';
import { isTypedBlock, parseTypedBlock } from './typedBlock';
import { DEFAULT_IMPORT, makeMcq, makeShort, makeTrueFalse, newRowId, type DraftItem, type DraftSource, type ImportDefaults } from './types';

export interface ParseTextResult {
  drafts: DraftItem[];
  /** Đoạn chữ dài đứng trước câu đầu tiên (thường là bài đọc) — GV có thể chèn vào đề các câu. */
  preamble?: string;
  /** Số đáp án lấy được từ bảng đáp án cuối đề. */
  answerTableCount: number;
}

/** Kí tự bộ đọc .docx chèn trước đoạn chữ được tô đậm / gạch chân / tô màu trong một lựa chọn. */
export const MARK = '✓';
const MARK_CHARS = '✓✔☑';

interface Opt { text: string; marked: boolean; /** chữ gốc trước khi bỏ dấu đánh đáp án (cho Đúng–Sai) */ raw: string }
interface Block { num: number | null; lines: string[] }

const DOTS = /[.…_]{4,}|(?:\. ){3,}\.?/g;
const HAS_DOTS = /[.…_]{4,}|(?:\. ){3,}/;
const onlyDots = (s: string): boolean => s.replace(/[.…_\s-]/g, '') === '';

function cleanText(text: string): string[] {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[   　]/g, ' ')
    .replace(/[​-‍﻿­]/g, '')
    .replace(/\t/g, '   ')
    .split('\n')
    .map((l) => l.trim());
}

/* ------------------------------------------------------------------ */
/* Bảng đáp án                                                         */
/* ------------------------------------------------------------------ */
const ANSWER_HEADING = /^(?:bảng\s+)?(?:đáp\s*án|đáp\s*số|hướng dẫn chấm|answer key|answers?)(?:\s+(?:và|&)\s+[^:]*)?(?:\s+(?:phần\s+)?trắc nghiệm)?\s*[:.]?$/i;
const PAIRS_LINE = /^(?:(?:câu\s*)?\d{1,3}\s*[.\-:)–]?\s*[A-Ha-h]\s*[,;|]?\s*){2,}$/i;
const PAIR = /(\d{1,3})\s*[.\-:)–]?\s*([A-Ha-h])(?![A-Za-zÀ-ỹ])/g;
const ROW_NUMS = /^(?:câu(?:\s*hỏi)?|stt|số)\s*:?\s*((?:\d{1,3}\s+)+\d{1,3})$/i;
const ROW_KEYS = /^(?:đáp\s*án|đ\.?\s*a|ý đúng|trả lời)\s*:?\s*((?:[A-Ha-h]\s+)+[A-Ha-h])$/i;
const SINGLE_ANSWER = /^(?:câu\s*|bài\s*)?(\d{1,3})\s*[.:)\-–]\s*(.+)$/i;

function extractAnswerTable(lines: string[], isQuestionStart: (l: string) => boolean): { rest: string[]; answers: Map<number, string> } {
  const answers = new Map<number, string>();
  const rest: string[] = [];
  let seenQuestion = false;
  let inTable = false;
  const pairs = (l: string): boolean => {
    if (!PAIRS_LINE.test(l)) return false;
    for (const m of l.matchAll(PAIR)) answers.set(Number(m[1]), m[2].toUpperCase());
    return true;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) {
      if (!inTable) rest.push(l);
      continue;
    }
    // hai dòng: "Câu 1 2 3" / "Đáp án B C A"
    const rn = l.match(ROW_NUMS);
    if (rn) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      const rk = j < lines.length ? lines[j].match(ROW_KEYS) : null;
      const nums = rn[1].trim().split(/\s+/);
      const keys = rk ? rk[1].trim().split(/\s+/) : [];
      if (rk && nums.length === keys.length) {
        nums.forEach((n, k) => answers.set(Number(n), keys[k].toUpperCase()));
        i = j;
        continue;
      }
    }
    if (inTable) {
      if (pairs(l)) continue;
      const s = l.match(SINGLE_ANSWER);
      if (s && !onlyDots(s[2])) answers.set(Number(s[1]), s[2].trim());
      continue; // mọi thứ sau tiêu đề "ĐÁP ÁN" thuộc phần đáp án
    }
    if (seenQuestion && ANSWER_HEADING.test(l)) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      const next = lines[j] ?? '';
      if (PAIRS_LINE.test(next) || ROW_NUMS.test(next) || SINGLE_ANSWER.test(next)) {
        inTable = true;
        continue;
      }
    }
    if (seenQuestion && (pairs(l) || pairs(l.replace(/^(?:bảng\s+)?(?:đáp\s*án|đ\.?\s*a)[^:\d]{0,40}:\s*/i, '')))) continue;
    if (isQuestionStart(l)) seenQuestion = true;
    rest.push(l);
  }
  return { rest, answers };
}

/* ------------------------------------------------------------------ */
/* Tách khối câu hỏi                                                   */
/* ------------------------------------------------------------------ */
const Q_WORD = /^(?:câu hỏi|câu|bài|question)\s*(\d{1,3})(?![\dA-Za-zÀ-ỹ])\s*((?:\([^)]{0,40}\))?)\s*[.:)\-–]?\s*(.*)$/i;
const Q_NUM = /^(\d{1,3})\s*(?:[.)]\s+|\/\s+(?=\D))(\S.*)$/;
const SECTION = /^(?:(?:phần|part)\s+(?:[IVX]+|\d+|[A-C])\b.*|[IVX]{1,4}\s*[.:/)]\s*\S.*|[A-C]\s*[.:]\s*(?:PHẦN|TRẮC NGHIỆM|TỰ LUẬN|ĐỌC|KIỂM TRA).*|(?:PHẦN\s+)?(?:TRẮC NGHIỆM|TỰ LUẬN)(?:\s+KHÁCH QUAN)?\s*(?:\([^)]*\))?\s*:?)$/;

function splitBlocks(lines: string[]): { blocks: Block[]; preamble: string[]; numbered: boolean } {
  const wordStyle = lines.some((l) => Q_WORD.test(l));
  const blocks: Block[] = [];
  const preamble: string[] = [];
  let cur: Block | null = null;
  let last = 0;
  let idle = true; // sau tiêu đề phần: bỏ qua cho tới câu kế tiếp
  for (const l of lines) {
    if (l && SECTION.test(l)) {
      cur = null;
      idle = true;
      continue;
    }
    const w = l.match(Q_WORD);
    const n = !wordStyle ? l.match(Q_NUM) : null;
    if (w) {
      cur = { num: Number(w[1]), lines: [`${w[2] ? `${w[2]} ` : ''}${w[3]}`.trim()] };
      blocks.push(cur);
      last = cur.num ?? 0;
      idle = false;
      continue;
    }
    if (n && (Number(n[1]) === 1 || Number(n[1]) > last || blocks.length === 0) && Number(n[1]) <= last + 20) {
      cur = { num: Number(n[1]), lines: [n[2].trim()] };
      blocks.push(cur);
      last = cur.num ?? 0;
      idle = false;
      continue;
    }
    if (cur && !idle) cur.lines.push(l);
    else if (blocks.length === 0) preamble.push(l);
  }
  if (blocks.length > 0) return { blocks, preamble, numbered: true };
  // Không có số câu: tách theo dòng trống.
  const out: Block[] = [];
  let buf: string[] = [];
  for (const l of [...lines, '']) {
    if (l && SECTION.test(l)) continue;
    if (l) buf.push(l);
    else if (buf.length) {
      out.push({ num: null, lines: buf });
      buf = [];
    }
  }
  return { blocks: out, preamble: [], numbered: false };
}

/* ------------------------------------------------------------------ */
/* Lựa chọn                                                            */
/* ------------------------------------------------------------------ */
const LEAD_OPT = new RegExp(`^([*${MARK_CHARS}]\\s*)?\\(?([A-Ha-h])\\s*([.)/])(.*)$`);

/** Dòng bắt đầu bằng kí hiệu lựa chọn đúng thứ tự → { mark, rest } */
function leadOption(line: string, expected: string): { marked: boolean; rest: string } | null {
  const m = line.match(LEAD_OPT);
  if (!m || m[2] !== expected) return null;
  const rest = m[4];
  if (m[3] === '/' && rest && !/^\s/.test(rest)) return null; // "a/b" không phải lựa chọn
  return { marked: !!m[1], rest: rest.trim() };
}

/** Tìm kí hiệu lựa chọn `letter` nằm GIỮA dòng (sau khoảng trắng). */
function findInline(text: string, letter: string, from = 0): { index: number; end: number; marked: boolean } | null {
  const lower = letter === letter.toLowerCase();
  const re = new RegExp(`(\\s+)([*${MARK_CHARS}]\\s*)?\\(?${letter}\\s*([.)]|/(?=\\s))`, 'g');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // chữ thường với dấu chấm ("lớp b. Sau đó") dễ nhầm → cần ít nhất 2 khoảng trắng phía trước
    if (lower && m[3] === '.' && m[1].length < 2) continue;
    return { index: m.index, end: m.index + m[0].length, marked: !!m[2] };
  }
  return null;
}

const nextLetter = (first: string, i: number): string => String.fromCharCode(first.charCodeAt(0) + i);

const TRAIL_MARK = new RegExp(`\\s*(?:\\((?:đúng|đ|x)\\)|\\[x\\]|[${MARK_CHARS}]|\\*)\\s*$`, 'i');
const ANY_MARK = new RegExp(`[${MARK_CHARS}]`, 'g');
const HAS_MARK = new RegExp(`[${MARK_CHARS}]`);

function finishOption(text: string, marked: boolean): Opt {
  let t = text.trim();
  let m = marked;
  if (HAS_MARK.test(t)) {
    m = true;
    t = t.replace(ANY_MARK, '').trim();
  }
  if (t.startsWith('*')) {
    m = true;
    t = t.slice(1).trim();
  }
  while (TRAIL_MARK.test(t)) {
    m = true;
    t = t.replace(TRAIL_MARK, '').trim();
  }
  return { text: t.replace(/\s{2,}/g, ' '), marked: m, raw: text.replace(ANY_MARK, '').trim() };
}

/** Tách phần chữ sau kí hiệu lựa chọn thành các lựa chọn liên tiếp trên cùng dòng. */
function splitRun(rest: string, marked: boolean, first: string, startIdx: number): Opt[] {
  const out: Opt[] = [];
  let text = rest;
  let mark = marked;
  let idx = startIdx;
  for (;;) {
    const letter = nextLetter(first, idx + 1);
    if (letter > (first === 'a' ? 'h' : 'H')) break;
    const hit = findInline(` ${text}`, letter);
    if (!hit) break;
    out.push(finishOption(` ${text}`.slice(0, hit.index), mark));
    text = ` ${text}`.slice(hit.end);
    mark = hit.marked;
    idx++;
  }
  out.push(finishOption(text, mark));
  return out;
}

/* ------------------------------------------------------------------ */
/* Đáp án                                                              */
/* ------------------------------------------------------------------ */
const ANSWER_LINE = /^(?:đáp\s*án(?:\s+đúng)?(?:\s+là)?|đ\.?\s*a|đ\/a|trả lời|kết quả|đáp\s*số|đ\.?\s*s|answer|key)\s*[:\-–=]\s*(.*)$/i;
const CHOOSE_LINE = /^(?:chọn|khoanh(?:\s+vào)?|đáp án(?:\s+đúng)?(?:\s+là)?)\s*:?\s*(\(?[A-Ha-h]\)?(?:\s*(?:[,;&+]|và)?\s*\(?[A-Ha-h]\)?)*)\s*\.?$/i;
const HINT_LINE = /^(?:gợi ý|hướng dẫn)\s*[:\-–]\s*(.+)$/i;
const EXPL_LINE = /^(?:giải thích|lời giải|bài giải|giải|vì)\s*[:\-–]\s*(.*)$/i;

/** Đáp án GV ghi → chỉ số lựa chọn. null = không hiểu. */
export function resolveChoiceAnswer(raw: string, options: string[]): number[] | null {
  const n = options.length;
  const v = String(raw ?? '').trim().replace(/[.。;]+$/, '').trim();
  if (!v) return null;
  const idxOf = (ch: string): number => ch.toLowerCase().charCodeAt(0) - 97;
  const uniq = (a: number[]): number[] => [...new Set(a)].sort((x, y) => x - y);
  // 1) "B", "b", "(B)", "A, C", "A và C", "A C"
  if (/^\(?[A-Ha-h]\)?(?:\s*(?:[,;&+]|và|\s)\s*\(?[A-Ha-h]\)?)*$/.test(v)) {
    const ids = [...v.matchAll(/[A-Ha-h](?![a-zà-ỹ])/g)].map((m) => idxOf(m[0]));
    if (ids.length && ids.every((i) => i < n)) return uniq(ids);
  }
  // 2) "B. 6", "B) sáu"
  const lead = v.match(/^\(?([A-Ha-h])\)?\s*[.):\-–]\s*\S/);
  if (lead && idxOf(lead[1]) < n) return [idxOf(lead[1])];
  // 3) đúng nội dung một lựa chọn (hoặc nhiều, ngăn bằng ;)
  const keys = options.map((o) => promptKey(o));
  const whole = keys.indexOf(promptKey(v));
  if (whole >= 0) return [whole];
  const parts = v.split(/\s*[;|]\s*/).map((p) => keys.indexOf(promptKey(p)));
  if (parts.length > 1 && parts.every((i) => i >= 0)) return uniq(parts);
  // 4) số thứ tự 1..n
  if (/^\d$/.test(v) && Number(v) >= 1 && Number(v) <= n) return [Number(v) - 1];
  if (/^\d(?:\s*[,;]\s*\d)+$/.test(v)) {
    const ids = v.split(/[,;]/).map((x) => Number(x.trim()) - 1);
    if (ids.every((i) => i >= 0 && i < n)) return uniq(ids);
  }
  // 5) "AC", "ABD"
  if (/^[A-H]{2,6}$/.test(v)) {
    const ids = v.split('').map(idxOf);
    if (new Set(ids).size === ids.length && ids.every((i) => i < n)) return uniq(ids);
  }
  return null;
}

function truth(v: string): boolean | null {
  const t = v.trim().replace(/[.()[\]]/g, '').toLowerCase();
  if (t === 'đúng' || t === 'đ' || t === 'true') return true;
  if (t === 'sai' || t === 's' || t === 'false') return false;
  return null;
}

const splitAnswers = (v: string): string[] => v.split(/\s+hoặc\s+|\s*[;|]\s*/i).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);

/* ------------------------------------------------------------------ */
/* Một khối → câu hỏi                                                  */
/* ------------------------------------------------------------------ */
const TF_STEM = /đúng\s+ghi\s*đ|ghi\s*đ[\s,;].*s(?![a-zà-ỹ])|(?:^|[\s(])đ\s*(?:hoặc|hay|\/)\s*s(?![a-zà-ỹ])|đúng\s*(?:hay|hoặc|\/|,|–|-)\s*sai/i;
const TF_TAILS = [/\s*[[(]\s*(Đúng|Sai|Đ|S)\s*[\])]\.?$/i, /(?:\s+|[.…_]{2,}\s*)(Đ|S)\.?$/, /(?:[.…_]{2,}|[:\-–→])\s*(Đúng|Sai)\.?$/i];
function tfTail(t: string): { value: boolean | null; text: string } | null {
  for (const re of TF_TAILS) {
    const m = t.match(re);
    if (m) return { value: truth(m[1]), text: t.slice(0, m.index).trim() };
  }
  return null;
}
const SUBPART_STEM = /^(?:đặt tính rồi tính|tính nhẩm|tính giá trị biểu thức|tính|tìm x|tìm y|rút gọn|quy đồng|đổi|so sánh|điền số|điền dấu|viết số)(?![a-zà-ỹ])/i;
const EXPRESSION = /\d.*(?:[+\-–×x:÷=<>…*/]|\.{3})|(?:[+\-–×x:÷=<>…]).*\d/;
const POINTS = /\(\s*\d+(?:[.,]\d+)?\s*(?:điểm|đ)\s*\)/gi;
const LEVEL = /\(\s*(?:M|mức(?:\s*độ)?)\s*([1-4])\s*\)/i;

function cleanPrompt(lines: string[]): { text: string; difficulty?: ItemBase['difficulty'] } {
  let t = lines.join('\n').replace(ANY_MARK, '');
  let difficulty: ItemBase['difficulty'];
  const lv = t.match(LEVEL);
  if (lv) {
    difficulty = lv[1] === '1' ? 'nhan-biet' : lv[1] === '2' ? 'ket-noi' : 'van-dung';
    t = t.replace(LEVEL, ' ');
  }
  t = t
    .replace(POINTS, ' ')
    .replace(DOTS, '…')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/^[\s:.\-–]+/, '')
    .trim();
  return { text: t, ...(difficulty ? { difficulty } : {}) };
}

function draft(item: Item, source: DraftSource, raw: string, extra: Partial<DraftItem> = {}): DraftItem {
  return { rowId: newRowId(), item, source, notes: [], raw, ...extra };
}

function parseBlock(b: Block, answers: Map<number, string>, d: ImportDefaults, source: DraftSource, numbered: boolean): DraftItem[] {
  const raw = b.lines.join('\n').trim();
  const promptLines: string[] = [];
  const opts: Opt[] = [];
  let first = '';
  let answerRaw = '';
  let hint = '';
  let expl = '';
  let phase: 'prompt' | 'options' | 'after' = 'prompt';
  // pushRun (closure) đổi `phase` — đọc qua hàm để TS không thu hẹp kiểu sai.
  const ph = (): 'prompt' | 'options' | 'after' => phase;
  let gap = false;
  let lastField: 'hint' | 'expl' | 'answer' | null = null;

  const pushRun = (rest: string, marked: boolean): void => {
    opts.push(...splitRun(rest, marked, first, opts.length));
    phase = 'options';
    gap = false;
  };

  for (const line of b.lines) {
    if (!line) {
      if (ph() === 'options') gap = true;
      continue;
    }
    const ch = line.match(CHOOSE_LINE);
    const an = ch ?? line.match(ANSWER_LINE);
    if (an && (ch || phase !== 'prompt' || promptLines.length > 0)) {
      if (!onlyDots(an[1])) answerRaw = an[1].trim();
      phase = 'after';
      lastField = 'answer';
      continue;
    }
    const hi = line.match(HINT_LINE);
    if (hi && promptLines.length > 0) {
      hint = hi[1].trim();
      phase = 'after';
      lastField = 'hint';
      continue;
    }
    const ex = line.match(EXPL_LINE);
    if (ex && promptLines.length > 0 && (phase !== 'prompt' || !/^vì/i.test(line))) {
      if (!onlyDots(ex[1])) expl = ex[1].trim();
      phase = 'after';
      lastField = onlyDots(ex[1]) ? null : 'expl';
      continue;
    }
    if (phase !== 'after') {
      const expected = opts.length === 0 ? null : nextLetter(first, opts.length);
      if (expected) {
        const lo = leadOption(line, expected);
        if (lo) {
          pushRun(lo.rest, lo.marked);
          continue;
        }
      } else {
        const lo = leadOption(line, 'A') ?? leadOption(line, 'a');
        if (lo) {
          first = leadOption(line, 'A') ? 'A' : 'a';
          pushRun(lo.rest, lo.marked);
          continue;
        }
        // lựa chọn nằm cùng dòng với đề: "… = ? A. 4 B. 5 C. 6"
        for (const f of ['A', 'a']) {
          const a = findInline(line, f);
          if (!a) continue;
          const bHit = findInline(line, nextLetter(f, 1), a.end);
          if (!bHit) continue;
          const head = line.slice(0, a.index).trim();
          if (!head && promptLines.length === 0) continue;
          if (head) promptLines.push(head);
          first = f;
          pushRun(line.slice(a.end), a.marked);
          break;
        }
        if (ph() === 'options') continue;
      }
    }
    if (ph() === 'prompt') promptLines.push(line);
    else if (ph() === 'options') {
      if (!gap && opts.length) {
        const o = opts[opts.length - 1];
        o.text = `${o.text} ${line.replace(ANY_MARK, '')}`.trim();
        o.raw = `${o.raw} ${line.replace(ANY_MARK, '')}`.trim();
      }
    } else if (lastField === 'expl') expl = `${expl} ${line}`.trim();
    else if (lastField === 'hint') hint = `${hint} ${line}`.trim();
  }

  const { text: prompt, difficulty } = cleanPrompt(promptLines);
  const tableAnswer = b.num != null ? answers.get(b.num) ?? '' : '';
  const given = answerRaw || tableAnswer;
  const finish = (item: Item, extra: Partial<DraftItem> = {}): DraftItem => {
    const it = { ...item } as Item;
    if (difficulty) it.difficulty = difficulty;
    if (hint) it.hint = hint;
    if (expl) it.explanation = expl;
    return draft(it, source, raw, { ...(difficulty ? { given: { difficulty: true } } : {}), ...extra });
  };

  if (!prompt && opts.length === 0) {
    return raw ? [draft(makeShort(raw, [], d), source, raw, { review: 'Không nhận ra câu hỏi trong đoạn này' })] : [];
  }

  /* --- Đúng – Sai --- */
  const tfStem = TF_STEM.test(prompt);
  if (tfStem && opts.length >= 2) {
    const fromLine = given ? given.split(/[^A-Za-zÀ-ỹ]+/).filter((w) => /^(?:đúng|sai|đ|s)$/i.test(w)).map(truth) : [];
    return opts.map((o, i) => {
      let t = o.raw.replace(/[☐□▢]\s*$/, '').trim();
      let val: boolean | null = null;
      const m = tfTail(t);
      if (m) {
        val = m.value;
        t = m.text;
      }
      t = t.replace(DOTS, '').replace(/[\s:.\-–]+$/, (x) => (x.includes('.') ? '.' : '')).trim();
      if (val === null && fromLine.length === opts.length) val = fromLine[i];
      return finish(makeTrueFalse(`${prompt}\n${t}`, val, d));
    });
  }
  if (opts.length === 0 && (tfStem || (given && truth(given) !== null && !/^\d/.test(given)))) {
    let p = prompt;
    let val = given ? truth(given) : null;
    const m = tfTail(p);
    if (val === null && tfStem && m) {
      val = m.value;
      p = m.text;
    }
    if (tfStem || val !== null) return [finish(makeTrueFalse(p, val, d))];
  }

  /* --- nhiều ý a) b) c) của bài tự luận → mỗi ý một câu điền --- */
  if (opts.length >= 2 && first === 'a' && SUBPART_STEM.test(prompt) && !/\d/.test(prompt) && opts.every((o) => EXPRESSION.test(o.text)) && !opts.some((o) => o.marked) && (!given || /^\(?a\s*[.)/]/i.test(given))) {
    const ans = given ? splitRun(given.replace(/^\(?a\s*[.)/]\s*/i, ''), false, 'a', 0).map((o) => o.text) : [];
    return opts.map((o, i) => finish(makeShort(`${prompt.replace(/[:\s]+$/, '')}: ${o.text.replace(DOTS, '…')}`, ans[i] ? splitAnswers(ans[i]) : [], d)));
  }

  /* --- trắc nghiệm --- */
  if (opts.length >= 2) {
    const texts = opts.map((o) => o.text);
    const notes: string[] = [];
    let correct: number[] = [];
    if (given) {
      const r = resolveChoiceAnswer(given, texts);
      if (r) correct = r;
      else notes.push(`Không hiểu đáp án «${given}»`);
    }
    if (!correct.length) {
      const marked = opts.map((o, i) => (o.marked ? i : -1)).filter((i) => i >= 0);
      if (marked.length > 0 && marked.length < opts.length) correct = marked;
    }
    const item = makeMcq(prompt || 'Chọn đáp án đúng', texts, correct, d);
    const empty = texts.some((t) => !t);
    return [finish(item, { notes, ...(empty ? { review: 'Có lựa chọn đọc ra bị trống' } : !prompt ? { review: 'Không đọc được câu hỏi' } : {}) })];
  }
  if (opts.length === 1) {
    return [finish(makeShort(raw, [], d), { review: 'Chỉ đọc được 1 lựa chọn — thầy cô xem lại' })];
  }

  /* --- điền đáp án --- */
  const letterOnly = !!given && /^[A-Ha-h]$/.test(given);
  const item = makeShort(prompt, given && !letterOnly ? splitAnswers(given) : [], d);
  const notes = letterOnly ? [`Đáp án ghi «${given}» nhưng không đọc được các lựa chọn A, B, C…`] : [];
  if (!numbered && !given) return [finish(item, { notes, review: 'Không nhận ra dạng câu hỏi — thầy cô xem lại' })];
  return [finish(item, { notes, ...(letterOnly ? { review: 'Không đọc được các lựa chọn' } : {}) })];
}

/* ------------------------------------------------------------------ */
export function parseQuestionText(text: string, defaults: ImportDefaults = DEFAULT_IMPORT, source: DraftSource = 'text'): ParseTextResult {
  try {
    const lines = cleanText(text);
    if (!lines.some(Boolean)) return { drafts: [], answerTableCount: 0 };
    const wordStyle = lines.some((l) => Q_WORD.test(l));
    const { rest, answers } = extractAnswerTable(lines, (l) => (wordStyle ? Q_WORD.test(l) : Q_NUM.test(l)));
    const { blocks, preamble, numbered } = splitBlocks(rest);
    const drafts: DraftItem[] = [];
    for (const b of blocks) {
      try {
        // Câu có dòng "Dạng: …" (mẫu Word đủ 16 dạng) → bộ đọc theo dạng.
        if (isTypedBlock(b.lines)) {
          drafts.push(parseTypedBlock(b.lines, defaults, source, b.num !== null ? answers.get(b.num) : undefined));
          continue;
        }
        drafts.push(...parseBlock(b, answers, defaults, source, numbered));
      } catch {
        const raw = b.lines.join('\n').trim();
        if (raw) drafts.push(draft(makeShort(raw, [], defaults), source, raw, { review: 'Không đọc được đoạn này' }));
      }
    }
    // Phần hướng dẫn ở đầu tệp mẫu Word ("MẪU NHẬP CÂU HỎI…") không phải bài đọc.
    const isGuide = preamble.some((l) => /^mẫu nhập câu hỏi/i.test(l));
    const pre = isGuide ? '' : preamble.filter((l) => l && !HAS_DOTS.test(l) && !ANSWER_HEADING.test(l)).join('\n').trim();
    return { drafts, ...(pre.length >= 120 ? { preamble: pre } : {}), answerTableCount: answers.size };
  } catch {
    const raw = String(text ?? '').trim();
    return {
      drafts: raw ? [draft(makeShort(raw.slice(0, 2000), [], defaults), source, raw, { review: 'Không đọc được văn bản này' })] : [],
      answerTableCount: 0,
    };
  }
}
