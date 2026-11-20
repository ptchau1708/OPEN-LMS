# Hồ sơ học sinh, thành thạo kĩ năng, lỗ hổng & ôn tập — API cho người làm giao diện

Nguồn sự thật kiểu dữ liệu: `packages/contracts/src/{skills,mastery,profile}.ts`. Bộ máy tính (thuần, có kiểm thử):
`packages/data/src/mastery/*` (chép sang `supabase/functions/_shared/mastery` bằng `node tools/sync-scoring.mjs`).
Lắp ráp hồ sơ / tóm tắt phụ huynh: `packages/data/src/profile.ts`.

## 1. Danh mục kĩ năng (`@openedu/contracts`)
| Tên | Ghi chú |
|---|---|
| `SKILLS: Skill[]`, `SKILL_BY_CODE` | 226 kĩ năng Toán lớp 1–5 (L1 23 · L2 43 · L3 51 · L4 53 · L5 56) theo "Yêu cầu cần đạt" CT GDPT 2018 (nguyên văn) + 42 kĩ năng **tạm** (`provisional: true`, mạch `TAM-THOI`) cho Tiếng Việt/Tiếng Anh/TN&XH |
| `Skill` | `{ code, subject, grade, strand, topic, text, short, prereqs, provisional? }` — `short` ≤ 6 từ để hiện cho HS/phụ huynh |
| `skillsFor(subject, grade)`, `prereqClosure(code)`, `skillShort(code)` | `prereqClosure`: mọi kĩ năng nền, gần trước |
| `MISCONCEPTIONS` | `code → { text (GV), kidHint (HS), skill, rootSkill? }` — 28 mã, vd `QUEN-NHO`, `CONG-TU-CONG-MAU`, `SO-SANH-STP-THEO-DO-DAI` |
| `STRAND_LABEL`, `MASTERY_LEVEL_LABEL`, `MASTERY_LEVELS` | nhãn tiếng Việt |

Mã: `T4.PS.RUT-GON` = Toán lớp 4 · Phân số · rút gọn. Item: `skills?: string[]` (mục đầu là kĩ năng chính).
Quan niệm sai: `Choice.misconception` hoặc `key.misconceptions` (quy ước khóa: `KeyExtras` trong `items.ts`).

## 2. DataSource (dùng qua hook trong `@openedu/data`)
| Hàm | Hook | Trả về |
|---|---|---|
| `getSkillMastery(userId)` | `useSkillMastery(userId)` | `SkillMastery[]` (chỉ kĩ năng đã làm; vắng = `chua-hoc`) |
| `getClassHeatmap(classId, subject='toan')` | `useClassHeatmap(classId, subject?)` | `ClassHeatmap` |
| `getGapGroups(classId, subject='toan')` | `useGapGroups(classId, subject?)` | `GapGroup[]` (≥ 2 HS chung gốc, đông trước) |
| `getRemediationSets(userId)` | `useRemediationSets(userId)` | `RemediationSet[]` — ôn lại đến hạn → lỗ hổng mới (≤ 3) → ôn lại chưa đến hạn |
| `submitRemediationResult(userId, setId, results)` | `useSubmitRemediation()` → `mutate({ userId, setId, results })` | `RemediationOutcome { passed, correct, total, mastery, message }` |
| `getStudentProfile(userId)` | `useStudentProfile(userId)` | `StudentProfile` (360°) |
| `getParentSummary(childId)` | `useParentSummary(childId)` | `ParentSummary` (câu dễ hiểu + gợi ý ở nhà) |
| `getTodayTasks(userId)` | `useTodayTasks` | thêm nhiệm vụ `kind: 'practice'`, `targetId` = id bộ ôn tập, `subtitle` "Ôn 5 câu · 3 phút", `isNew: true`; chỉ bộ đến hạn, ≤ 3, chen trước nhiệm vụ đã xong |

Mọi hook invalidate nhau đúng: nộp câu (`useSubmitAnswer`) hoặc bộ ôn → tính lại thành thạo, ôn tập, hồ sơ, tóm tắt, bản đồ lớp, hôm nay.

### Luồng làm bộ ôn tập (app HS)
1. `useRemediationSets(me.id)` hoặc nhiệm vụ Hôm nay (`task.targetId`) → `set`.
2. `useItemsByIds(set.itemIds)`; HS trả lời từng câu bằng `useSubmitAnswer` (`context: { source: 'practice' }`).
3. Xong: `useSubmitRemediation().mutate({ userId, setId: set.id, results: [{ itemId, correct }] })` → hiện `outcome.message`.
   Supabase: server tự đếm đúng/sai từ câu trả lời gần nhất (≤ 3 giờ) — `results.correct` chỉ dùng ở demo.

### Kiểu chính (rút gọn)
```ts
SkillMastery { userId; skillCode; level: 'chua-hoc'|'dang-hoc'|'can-on'|'vung'; p /*0..1*/; attempts; correctStreak;
  distinctDays; lastAt?; misconceptions: Record<code, count>; nextReviewAt?; reviewStage: 0|1|2|3; wasGap; recentWrong: {itemId, at, misconception?}[] }
KnowledgeGap { skillCode; rootSkill; rootChain: string[]; p; attempts; priority; topMisconceptions: {code,count,text,kidHint}[]; evidence }
RemediationSet { id /*rem:<user>:<skill>:<stage>*/; kind: 'remediation'|'review'; skillCode; rootSkill; subject; title /*HS*/; reason /*GV, PH*/;
  itemIds /*3–5, gốc trước, dễ trước*/; reviewStage; dueAt; minutes }
ClassHeatmap { students[]; skills: {code, short, topic, strand, grade}[]; cells[studentId][skillCode]: {level, p, attempts, topMisconception?};
  skillSummary[code]: {counts, avgP} }   // ô vắng = chua-hoc
GapGroup { rootSkill; rootShort; gapSkills; students: {id,name,p}[]; topMisconceptions; suggestion /*cho GV*/; itemIds }
StudentProfile { student; class{…teacherName, team}; wallet; passport; mastery{bySubject[], counts}; gaps (≤5); strengths (≤5);
  lessons: {lessonId,title,status:'chua-bat-dau'|'dang-hoc'|'hoan-thanh',progress,starsEarned,dueAt?}[]; timeline (≤30, mới trước,
  kind: lesson|practice|arena|live|reward|remediation); live{sessions,answered,correct}; remediation; work; behavior; attendance; tt27 }  // Phase 4: docs/PHASE4_API.md
ParentSummary { headline; sentences[]; week{daysActive, answered, correctRate|null, stars, lessonsCompleted}; gaps: {sentence, suggestions[1–3]}[]; strengths[] }
```

## 3. Luật tính (ngưỡng: `packages/data/src/mastery/constants.ts`)
- `p` = tỉ lệ đúng có trọng số `0.5^(tuổi / 10 ngày)` (chỉ thứ tự thời gian quan trọng; không đổi theo "bây giờ").
- Mức (khi ≥ 3 lần làm): trượt bộ ôn / tái phát → `can-on` · đang ở chặng ôn 1–2 → `dang-hoc` · `p < 0.6` → `can-on` ·
  `p ≥ 0.85` & đúng liền ≥ 3 & ≥ 2 ngày & (chưa vào luồng ôn hoặc đã tới chặng 3) → `vung` · còn lại `dang-hoc`. 0 lần: `chua-hoc`; 1–2 lần: `dang-hoc`.
- Bộ ôn **đạt** khi đúng ≥ 80% (4/5, 3/4, 2/3): chặng +1, hẹn ôn lại +1 / +3 / +7 ngày. **Chưa đạt** → chặng 0, `can-on`.
  Đang ôn mà sai 3 câu liền → tái phát (chặng 0, `can-on`).
- Gốc lỗ hổng: lần theo `prereqs`, kĩ năng nền yếu nhất (≥ 3 lần, `can-on` hoặc `dang-hoc` với p < 0.7) thành gốc, lặp tiếp;
  không có thì dùng `rootSkill` của quan niệm sai hay gặp (nếu kĩ năng đó yếu). Mỗi gốc một bộ ôn.
- Demo: tính lại khi đọc (bộ nhớ đệm theo HS, xoá khi có sự kiện mới / đổi câu hỏi, TTL 60 giây).
  Supabase: Edge Function `grade` tính lại & upsert `skill_mastery` sau mỗi câu trả lời và mỗi bộ ôn.

## 4. Dữ liệu demo
Lớp **4A** (`c-4a`, GV `cothu`), 8 HS `hai4a1 … thao4a8` (mật khẩu 123456), phụ huynh `phuhuynh4a` → Ngọc Lan.
~2 tuần lịch sử tổng hợp tất định (`seed/synthetic-4a.ts`): Hải giỏi đều · Lan & Vy hổng phân số do chưa vững quy đồng ·
Khoa & Thảo hay quên nhớ · Mai so sánh số thập phân theo độ dài (thử sức lớp 5) · Tuấn tiến bộ, đã qua 2 chặng ôn "Rút gọn
phân số" (ôn lại đến hạn hôm nay) · Nam yếu số lớp triệu, làm tròn. Bài giao: "Phân số" (lớp 4). Bài lớp 5 "Số thập phân".
