/** Xáo trộn ổn định theo seed (thường là item.id): cùng item → cùng thứ tự trên mọi máy, TV và GV. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const out = arr.slice();
  const rnd = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // tránh trường hợp xáo xong trùng thứ tự gốc (với dạng sắp xếp, thứ tự gốc thường là đáp án)
  if (out.length > 1 && out.every((v, i) => v === arr[i])) out.push(out.shift() as T);
  return out;
}
