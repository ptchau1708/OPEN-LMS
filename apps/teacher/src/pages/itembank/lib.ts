/** Tiện ích chung cho "Thêm câu hỏi nhanh" (tải lười mã nhập liệu, tải tệp về máy). */
export type ImportLib = typeof import('@openedu/data/import');

let libP: Promise<ImportLib> | null = null;
/** Mã đọc Excel/Word/văn bản chỉ tải khi GV mở hộp thoại (không nằm trong gói tải đầu). */
export function loadImportLib(): Promise<ImportLib> {
  if (!libP) {
    libP = import('@openedu/data/import');
    libP.catch(() => { libP = null; });
  }
  return libP;
}

export function downloadBytes(bytes: Uint8Array, name: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function readFileBytes(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
