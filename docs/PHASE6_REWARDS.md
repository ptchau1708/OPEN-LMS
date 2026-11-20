# Phase 6 — Huy hiệu, cửa hàng trang phục linh vật, Vườn lớp

Mọi hình vẽ (24 huy hiệu, 20 món đồ, 6 loại cây × 5 giai đoạn) đều vẽ mới bằng SVG — không dựa trên nhân vật có bản quyền.
Không có tiền thật: xu chỉ kiếm bằng học, chỉ tiêu trong cửa hàng.

## Mã nguồn
| Phần | Tệp |
|---|---|
| Hợp đồng | `packages/contracts/src/badges.ts` (BADGES, SHOP_ITEMS, PLANTS, `RewardsSource`); `RewardEntry.sourceType` thêm `'shop'` |
| Quy tắc thuần | `packages/data/src/badges/rules.ts` — `badgeStatsFrom`, `badgeProgress`, `newlyEarnedBadges`, `checkPurchase`, `purchaseEntry`, `personalStage`, `goalStage`, `assembleGarden`, `anonymizeGarden` |
| Nguồn dữ liệu | `getRewardsSource(ds)` (tải động `badges/demo.ts` hoặc `badges/supabase.ts`); hook trong `badges/react.tsx` (`useBadgeShelf`, `useEvaluateBadges`, `useShop`, `useBuyItem`, `useEquipItem`, `useClassGarden`, `useSetGardenGoal`, `useGrantTeacherBadge`, `useTeacherBadges`) |
| Hình vẽ | `packages/ui/src/badges/BadgeArt.tsx`, `outfits/outfits.tsx` (`DressedMascot`, `outfitWear`, điểm neo), `garden/Plant.tsx`, `garden/GardenScene.tsx`; CSS `@openedu/ui/rewards.css` (nhập trong trang dùng tới) |
| App HS | `/toi` (kệ huy hiệu, avatar mặc đồ), `/cua-hang`, `/vuon-lop`, `/qua` (lối vào), nút "Vườn lớp em" ở Hôm nay; `pages/rewards/BadgeWatcher.tsx` (tải lười) xét huy hiệu khi số sao đổi và hiện màn chúc mừng |
| App GV | `/vuon-lop` — xem vườn (có tên từng HS), đặt mục tiêu tuần + loại cây, "Mở trên TV", tặng "Huy hiệu của cô" |
| Màn hình lớp | `apps/present` `/vuon-lop?lop=<classId>` (chữ to, tự làm mới 60 giây, `&tinh=1` tắt chuyển động) |
| CSDL | `supabase/migrations/20261113000009_v2_rewards.sql`, kiểm thử `supabase/tests/database/rls_rewards.test.sql` |

## Huy hiệu
24 huy hiệu theo 7 nhóm (chăm chỉ, khám phá, vá lỗ hổng, bài viết, đấu trường, thi đua lớp, đặc biệt) + "Huy hiệu của cô".
Quy tắc = `{ kind, min, subject? }`, đạt khi số liệu ≥ ngưỡng. Số liệu (`BadgeStats`):
| kind | Nguồn |
|---|---|
| streak | chuỗi ngày học dài nhất (ngày giờ VN có dòng sổ thưởng sao/xp, trừ 'shop'; máy chủ lấy max với `streaks.best_days`) |
| lessons (+subject) | bài giảng hoàn thành (sổ thưởng 'lesson' ∪ sự kiện completed/lesson), môn theo `lessons.subject` |
| remediation | sự kiện `completed/remediation` có `result.correct = true` |
| work / workTop | bài viết được duyệt (sổ thưởng 'work') / bài mức T (sự kiện 'work', `response.level = 'T'`) |
| duels / duelWins | sự kiện `completed/arena` `duel:*` (thắng: `result.correct`) |
| tower | số câu đúng ở Leo tháp (sổ thưởng 'arena' không phải `duel:`) |
| behavior / help | tổng điểm thi đua dương / số lần được khen "Giúp đỡ bạn" (id `bh-giup-ban` hoặc nhãn có chữ "giúp") |
| live | số buổi học trực tiếp (sự kiện joined/live; demo: số ngày có thưởng 'live') |

Thời điểm trao: `BadgeWatcher` gọi `evaluateBadges` khi mở app và mỗi lần số sao đổi; trả về huy hiệu chưa xem → màn chúc mừng
(tắt tia sáng/giấy màu khi "Giảm chuyển động") → `markBadgesSeen`. **Lần xét đầu tiên** của một HS coi mọi huy hiệu đã đủ điều kiện
là đã xem (không dồn hàng chục màn chúc mừng). Huy hiệu chưa có hiện xám + gợi ý cách nhận + tiến độ.
"Huy hiệu của cô": GV đặt tên (≤ 40 kí tự), chọn 1 trong 6 biểu tượng (`TEACHER_BADGE_GLYPHS`), lời khen (≤ 120 kí tự).

## Xu và cửa hàng
- **Kiếm xu: 1 sao = 1 xu.** Trước Phase 6 máy chủ hầu như không ghi xu (chỉ thi đua, Đấu 1–1). Migration vá `v2._award`: nơi gọi
  ghi `coins = 0` mà có sao dương → coins = số sao; và chuyển dữ liệu cũ một lần (`update reward_ledger set coins = stars where coins = 0 and stars > 0`).
  Demo vốn đã ghi `coins = stars`.
- **Tiêu xu:** `buy_item` (khóa advisory theo HS, kiểm tra số dư = Σ coins) ghi dòng sổ thưởng `source_type 'shop'`, `coins = −giá`,
  `stars = 0`, dedupe `shop:<item>`; thêm `user_items`. Sao/cấp độ không giảm; dòng 'shop' không tính là ngày học (chuỗi ngày).
- 20 món: 6 mũ, 4 kính, 5 khăn/nơ, 5 phông nền (15–60 xu). Giá trong bảng `v2.shop_items` là gốc; vitest kiểm tra khớp `SHOP_ITEMS`.
- **Điểm neo:** mũ đặt ở `(50, hatY)` (mặc định 20 = đỉnh đầu + 6; Capi 21, Kiwi 19.5, Công 26 × 0.82), kính ở `(50, eyeY)` với hai tròng
  ở ±`eyeDX` lấy từ `SPECS` từng linh vật, khăn ở `(50, 69)`. Đội mũ thì linh vật thu nhỏ 0.84 quanh chân để mũ không bị cắt và mũ thay
  đồ đội sẵn (nón lá, quả yuzu, khăn Thái, mũ nồi, mào); đeo khăn thì thay khăn sẵn (Shiba, Hổ). Đã soát đủ 10 linh vật × 5 tâm trạng.

## Vườn lớp
- Sao tuần = Σ sao dương từ 0 giờ thứ Hai (giờ VN). Cây lớp: `goalStage(classStars / target)` — mầm > 0, cây non 25%, nụ 60%, hoa 100%.
  Cây riêng HS: `personalStage(stars)` — mốc 1 / 5 / 12 / 20 sao. Lớp 1–3 có tổ: ô theo tổ, mốc = phần mục tiêu theo sĩ số tổ.
- Mục tiêu mặc định 25 sao × sĩ số (làm tròn lên bội 10, ≥ 50); cây xoay vòng theo tuần. GV đặt mục tiêu/cây cho tuần này (cũng thành
  mặc định các tuần sau). Đạt mục tiêu → cây vào "Bộ sưu tập".
- **Không xếp hạng:** HS chỉ nhận tổng lớp, tổng tổ và phần của mình (máy chủ không gửi số sao từng bạn); màn hình TV ẩn tên và số sao từng HS
  (`anonymizeGarden`, ô xếp theo thứ tự cố định không theo số sao). Chỉ GV thấy tên từng HS.

## Supabase
| Bảng | Ghi chú |
|---|---|
| `badges` (id, category, title, hint, glyph, tier, rule_kind, min_value, subject, position) | ai cũng đọc |
| `user_badges` (id, user_id, badge_id, earned_at, title, glyph, note, granted_by, seen_at) | đọc theo `can_view_user`; mỗi huy hiệu quy tắc 1 lần/HS |
| `badge_evals` (user_id, first_at, last_at) | đánh dấu lần xét đầu |
| `shop_items`, `user_items` (user_id, item_id, price, ledger_id), `equipped` (user_id, slot, item_id) | equipped: bạn cùng lớp cũng đọc được |
| `class_gardens` (class_id, default_target), `garden_goals` (class_id, week_start, target_stars, plant, set_by, reached_at) | đọc theo `can_see_class` |

HS chỉ có quyền SELECT; mọi ghi qua RPC security definer:
| RPC | Ai |
|---|---|
| `get_badge_shelf(p_user)` → `{ stats, earned[] }` | người xem được HS |
| `evaluate_badges()` → huy hiệu chưa xem · `mark_badges_seen(p_ids uuid[])` | HS (chính mình) |
| `grant_teacher_badge(p_class, p_students, p_title, p_glyph, p_note)` · `list_teacher_badges(p_class)` | GV lớp, admin |
| `get_shop()` · `buy_item(p_item)` · `equip_item(p_slot, p_item = null)` → ShopState | HS (mua) / người dùng |
| `get_class_garden(p_class)` → GardenRaw đã lọc quyền · `set_garden_goal(p_class, p_target, p_plant)` | HS của lớp / GV lớp |

Màn hình TV trên Supabase gọi `get_class_garden` nên cần phiên đăng nhập giáo viên trên trình duyệt đó (bản demo không cần).
Triển khai: chạy migration `20261113000009_v2_rewards.sql` (thêm `'shop'` vào ràng buộc `reward_ledger.source_type`, giữ các giá trị migration khác đã thêm).

## Kiểm thử
- `packages/data/src/__tests__/badges.test.ts`: quy tắc huy hiệu, khớp bảng migration, xu, mốc lớn lên của cây, DemoRewardsSource.
- `supabase/tests/database/rls_rewards.test.sql` (30 test): xu tự động, HS không tự cấp huy hiệu/đồ/xu, mua thiếu xu/mua trùng, mặc đồ chưa có,
  vườn chỉ thấy phần của mình, GV tặng huy hiệu chỉ cho lớp mình, mục tiêu đạt → bộ sưu tập. Chạy: `tools/run-db-tests.sh --plain`.
