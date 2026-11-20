-- OPEN-EDU v2 — Phase 7: AI gợi ý khi học sinh làm sai (docs/PHASE7_AI_HINT.md).
-- Thêm nhóm hạn mức 'hint' cho v2.ai_usage (Edge Function ai-gateway, task 'hint': AI_DAILY_LIMIT_HINT, mặc định 40 lượt/HS/ngày).
-- Chạy lại nhiều lần được. Không đổi bảng nào khác: `hintsUsed` nằm trong learning_events.result (jsonb, ghi qua v2.annotate_answer).

alter table v2.ai_usage drop constraint if exists ai_usage_bucket_check;
alter table v2.ai_usage add constraint ai_usage_bucket_check check (bucket in ('generate', 'encourage', 'grade', 'hint'));
