export * from './items';
export * from './subjects';
export * from './mascots';
export * from './lessons';
export * from './live';
export * from './users';
export * from './data';
export * from './component-api';
export * from './skills';
export * from './skills-toan';
export * from './skills-provisional';
export * from './skills-ct2018';
export * from './skills-misconceptions';
export * from './mastery';
export * from './profile';
export * from './assess';
export * from './engagement';
export * from './duel';
export * from './school';
export * from './badges';
export * from './exam';

/** Tạo id ngắn, đủ duy nhất cho client (demo). */
export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}_${r}` : r;
}

export function nowIso(): string {
  return new Date().toISOString();
}
