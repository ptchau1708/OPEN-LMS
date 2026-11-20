// Phase 6 — Đề kiểm tra theo ma trận + làm bài trực tuyến (docs/PHASE6_EXAM.md).
export * from './matrix';
export * from './shuffle';
export * from './scoring';
export * from './integrity';
export * from './report';
export { EXAM_EXTRA_ITEMS, MATRIX_TOAN4_CK1, MATRIX_TOAN5_GK1, SEED_MATRICES } from './seed';
export { DemoExamService, DEMO_EXAM_ID } from './demo';
export { SupabaseExamService } from './supabase';
export { getExamService, setExamService } from './service';
export * from './hooks';
