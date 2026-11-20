/** Tài khoản hàng loạt: tách danh sách "Họ tên", sinh tên đăng nhập (an4a1) + mật khẩu (thuần, có kiểm thử). */
import { foldVietnamese } from '../text';
import { secureRandom, type Rand } from './codes';

/** Bỏ dấu, chỉ giữ a–z0–9. */
export function slugAscii(s: string): string {
  return foldVietnamese(s).replace(/[^a-z0-9]/g, '');
}

/** Tên gọi (từ cuối) không dấu: "Nguyễn Thị Ngọc Ánh" → "anh". */
export function givenNameSlug(fullName: string): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const s = slugAscii(words[i]);
    if (s) return s.slice(0, 12);
  }
  return 'hs';
}

const HEADER = /^(stt|họ\s*(và\s*)?tên|ho\s*(va\s*)?ten|tên|ten|name)$/i;

/** Dán từ Excel/Word: mỗi dòng một em; bỏ STT đầu dòng, cột thừa (tab, ;), dòng tiêu đề, dòng trống. */
export function parseNameList(text: string): string[] {
  const out: string[] = [];
  for (const raw of (text ?? '').split(/\r?\n/)) {
    let cols = raw.split(/\t|;/).map((c) => c.trim()).filter(Boolean);
    if (cols.length > 1 && /^\d+[.)]?$/.test(cols[0])) cols = cols.slice(1);
    let name = (cols[0] ?? '').replace(/^\d+\s*[.)\-–]\s*/, '').replace(/^\d+\s+(?=\p{L})/u, '').replace(/\s+/g, ' ').trim();
    if (!name || HEADER.test(name) || !/\p{L}/u.test(name)) continue;
    name = name.normalize('NFC');
    out.push(name);
  }
  return out;
}

/** 6 chữ số, không bắt đầu bằng 0, không quá dễ (không 6 số giống nhau / tăng dần). */
export function generatePassword(rand: Rand = secureRandom): string {
  for (let tries = 0; ; tries++) {
    if (tries > 20) rand = secureRandom; // nguồn ngẫu nhiên tiêm vào bị kẹt (hằng số) → dùng crypto
    let s = String(1 + Math.floor(rand() * 9));
    for (let i = 0; i < 5; i++) s += String(Math.floor(rand() * 10) % 10);
    if (/^(\d)\1{5}$/.test(s) || '0123456789'.includes(s) || s === '123456') continue;
    return s;
  }
}

export interface NewAccount {
  name: string;
  username: string;
  password: string;
}

/**
 * Tên đăng nhập = tên gọi + tên lớp + số thứ tự trong lớp: "an4a1". Số bắt đầu từ `startIndex` (số HS hiện có + 1);
 * trùng với tài khoản đã có (cả trường) → tăng số tới khi không trùng.
 */
export function generateStudentAccounts(names: string[], className: string, existing: Iterable<string>, startIndex = 1, rand: Rand = secureRandom): NewAccount[] {
  const taken = new Set([...existing].map((u) => u.toLowerCase()));
  const cls = slugAscii(className) || 'lop';
  const out: NewAccount[] = [];
  let n = Math.max(1, startIndex);
  for (const name of names) {
    const base = givenNameSlug(name) + cls;
    let u = `${base}${n}`;
    let k = n;
    while (taken.has(u)) u = `${base}${++k}`;
    taken.add(u);
    out.push({ name, username: u, password: generatePassword(rand) });
    n++;
  }
  return out;
}

/** GV: "Nguyễn Thị Thu" → "thunt" (tên gọi + chữ đầu họ, đệm); trùng → thêm số. */
export function teacherUsername(fullName: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map((u) => u.toLowerCase()));
  const words = (fullName ?? '').trim().split(/\s+/).map(slugAscii).filter(Boolean);
  const base = words.length ? words[words.length - 1] + words.slice(0, -1).map((w) => w[0]).join('') : 'gv';
  let u = base;
  for (let i = 2; taken.has(u); i++) u = `${base}${i}`;
  return u;
}
