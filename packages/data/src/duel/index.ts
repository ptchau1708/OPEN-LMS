// Đấu 1–1 (Đấu trường) — logic thuần, máy trạng thái, kênh, dịch vụ demo/Supabase.

export * from './logic';
export * from './machine';
export { DuelMatch, attachBot, botChannel, broadcastTransport, loopbackPair, realClock, type DuelClock } from './match';
export { DemoDuelService, statsFromEvents, robo } from './demo';
export { SupabaseDuelService } from './supabase';
export { useDuelService, useDuelStats } from './hooks';
export { getDuelService } from './service';
