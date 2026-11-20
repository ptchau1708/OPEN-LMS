/** Bỏ dấu tiếng Việt để tìm kiếm: "cộng" khớp "cong", "Đếm" khớp "dem". */
export function foldVietnamese(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSearch(haystack: string, needle: string): boolean {
  const n = foldVietnamese(needle);
  if (!n) return true;
  return foldVietnamese(haystack).includes(n);
}
