/**
 * Phase 6 — Huy hiệu, cửa hàng trang phục linh vật, Vườn lớp (docs/PHASE6_REWARDS.md).
 * Huy hiệu xét bằng quy tắc thuần trên số liệu học tập (packages/data/src/badges/rules.ts) —
 * Supabase xét lại trên máy chủ (RPC evaluate_badges, cùng bảng ngưỡng trong migration).
 * Không có tiền thật: xu chỉ kiếm bằng học (1 sao = 1 xu) và chỉ tiêu trong cửa hàng.
 */
import type { MascotId } from './mascots';
import type { SubjectId } from './subjects';

/* ======================= huy hiệu ======================= */
export type BadgeCategory = 'cham-chi' | 'kham-pha' | 'va-lo-hong' | 'bai-viet' | 'dau-truong' | 'thi-dua' | 'dac-biet' | 'cua-co';

export const BADGE_CATEGORIES: { id: BadgeCategory; name: string; color: string }[] = [
  { id: 'cham-chi', name: 'Chăm chỉ', color: '#ff8a3d' },
  { id: 'kham-pha', name: 'Khám phá', color: '#2f7bf6' },
  { id: 'va-lo-hong', name: 'Vá lỗ hổng', color: '#20a974' },
  { id: 'bai-viet', name: 'Bài viết', color: '#8b5cf6' },
  { id: 'dau-truong', name: 'Đấu trường', color: '#e8485f' },
  { id: 'thi-dua', name: 'Thi đua lớp', color: '#f5b400' },
  { id: 'dac-biet', name: 'Đặc biệt', color: '#0ea5a4' },
  { id: 'cua-co', name: 'Huy hiệu của thầy/cô', color: '#ff5d8f' },
];

/** Hình vẽ chính giữa huy hiệu (packages/ui/src/badges). */
export type BadgeGlyph =
  | 'flame' | 'sun' | 'rocket' | 'book' | 'compass' | 'abacus' | 'letters' | 'globe' | 'leaf'
  | 'bandage' | 'wrench' | 'pencil' | 'quill' | 'crown' | 'bolt' | 'trophy' | 'tower' | 'flag'
  | 'star' | 'medal' | 'tv' | 'hands' | 'heart' | 'flower' | 'rainbow' | 'cup';

/** Biểu tượng GV được chọn cho "Huy hiệu của thầy/cô" (bộ giới hạn). */
export const TEACHER_BADGE_GLYPHS: BadgeGlyph[] = ['heart', 'star', 'flower', 'cup', 'rainbow', 'sun'];

/** Loại số liệu mà quy tắc so với ngưỡng. */
export type BadgeStatKind =
  | 'streak' | 'lessons' | 'remediation' | 'work' | 'workTop' | 'duels' | 'duelWins' | 'tower' | 'behavior' | 'live' | 'help';

export interface BadgeRule {
  kind: BadgeStatKind;
  /** Đạt khi số liệu ≥ ngưỡng. */
  min: number;
  /** Chỉ với 'lessons': đếm bài của một môn. */
  subject?: SubjectId;
}

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  title: string;
  /** Gợi ý khi chưa có: "Học 3 ngày liền". */
  hint: string;
  glyph: BadgeGlyph;
  /** 1 đồng · 2 bạc · 3 vàng (viền huy hiệu). */
  tier: 1 | 2 | 3;
  rule: BadgeRule;
}

/** 24 huy hiệu. Thứ tự = thứ tự trên kệ. Trùng khớp bảng `v2.badges` trong migration 20261113000009. */
export const BADGES: BadgeDef[] = [
  { id: 'streak-3', category: 'cham-chi', title: 'Ba ngày chăm chỉ', hint: 'Học 3 ngày liền', glyph: 'flame', tier: 1, rule: { kind: 'streak', min: 3 } },
  { id: 'streak-7', category: 'cham-chi', title: 'Tuần lễ siêng năng', hint: 'Học 7 ngày liền', glyph: 'sun', tier: 2, rule: { kind: 'streak', min: 7 } },
  { id: 'streak-30', category: 'cham-chi', title: 'Tháng bền bỉ', hint: 'Học 30 ngày liền', glyph: 'rocket', tier: 3, rule: { kind: 'streak', min: 30 } },
  { id: 'lesson-1', category: 'kham-pha', title: 'Bài học đầu tiên', hint: 'Học xong 1 bài giảng', glyph: 'book', tier: 1, rule: { kind: 'lessons', min: 1 } },
  { id: 'lesson-10', category: 'kham-pha', title: 'Nhà thám hiểm', hint: 'Học xong 10 bài giảng', glyph: 'compass', tier: 3, rule: { kind: 'lessons', min: 10 } },
  { id: 'toan-3', category: 'kham-pha', title: 'Bạn thân của Toán', hint: 'Học xong 3 bài Toán', glyph: 'abacus', tier: 2, rule: { kind: 'lessons', min: 3, subject: 'toan' } },
  { id: 'tv-3', category: 'kham-pha', title: 'Bạn thân của Tiếng Việt', hint: 'Học xong 3 bài Tiếng Việt', glyph: 'letters', tier: 2, rule: { kind: 'lessons', min: 3, subject: 'tieng-viet' } },
  { id: 'ta-2', category: 'kham-pha', title: 'Xin chào thế giới', hint: 'Học xong 2 bài Tiếng Anh', glyph: 'globe', tier: 2, rule: { kind: 'lessons', min: 2, subject: 'tieng-anh' } },
  { id: 'tnxh-2', category: 'kham-pha', title: 'Nhà tự nhiên nhí', hint: 'Học xong 2 bài Tự nhiên và Xã hội', glyph: 'leaf', tier: 2, rule: { kind: 'lessons', min: 2, subject: 'tnxh' } },
  { id: 'rem-1', category: 'va-lo-hong', title: 'Vá lỗ hổng đầu tiên', hint: 'Ôn đạt 1 bộ “Ôn lại cho chắc”', glyph: 'bandage', tier: 1, rule: { kind: 'remediation', min: 1 } },
  { id: 'rem-5', category: 'va-lo-hong', title: 'Thợ vá siêu đẳng', hint: 'Ôn đạt 5 bộ “Ôn lại cho chắc”', glyph: 'wrench', tier: 3, rule: { kind: 'remediation', min: 5 } },
  { id: 'work-1', category: 'bai-viet', title: 'Bài viết đầu tay', hint: 'Có 1 bài viết được thầy/cô duyệt', glyph: 'pencil', tier: 1, rule: { kind: 'work', min: 1 } },
  { id: 'work-5', category: 'bai-viet', title: 'Cây bút chăm chỉ', hint: 'Có 5 bài viết được thầy/cô duyệt', glyph: 'quill', tier: 2, rule: { kind: 'work', min: 5 } },
  { id: 'work-top', category: 'bai-viet', title: 'Ngòi bút vàng', hint: 'Có 1 bài viết đạt mức Hoàn thành tốt', glyph: 'crown', tier: 3, rule: { kind: 'workTop', min: 1 } },
  { id: 'duel-1', category: 'dau-truong', title: 'Trận đấu đầu tiên', hint: 'Chơi 1 trận Đấu 1–1', glyph: 'bolt', tier: 1, rule: { kind: 'duels', min: 1 } },
  { id: 'duel-win-3', category: 'dau-truong', title: 'Ba lần chiến thắng', hint: 'Thắng 3 trận Đấu 1–1', glyph: 'trophy', tier: 2, rule: { kind: 'duelWins', min: 3 } },
  { id: 'tower-10', category: 'dau-truong', title: 'Leo tháp', hint: 'Trả lời đúng 10 câu ở Leo tháp', glyph: 'tower', tier: 1, rule: { kind: 'tower', min: 10 } },
  { id: 'tower-50', category: 'dau-truong', title: 'Chinh phục đỉnh tháp', hint: 'Trả lời đúng 50 câu ở Leo tháp', glyph: 'flag', tier: 3, rule: { kind: 'tower', min: 50 } },
  { id: 'behavior-10', category: 'thi-dua', title: 'Ngôi sao của lớp', hint: 'Được thầy/cô khen 10 điểm thi đua', glyph: 'star', tier: 1, rule: { kind: 'behavior', min: 10 } },
  { id: 'behavior-30', category: 'thi-dua', title: 'Tấm gương sáng', hint: 'Được thầy/cô khen 30 điểm thi đua', glyph: 'medal', tier: 3, rule: { kind: 'behavior', min: 30 } },
  { id: 'live-1', category: 'dac-biet', title: 'Lớp học trên TV', hint: 'Vào lớp học trực tiếp lần đầu', glyph: 'tv', tier: 1, rule: { kind: 'live', min: 1 } },
  { id: 'live-5', category: 'dac-biet', title: 'Bạn nhỏ hăng hái', hint: 'Vào lớp học trực tiếp 5 lần', glyph: 'rainbow', tier: 2, rule: { kind: 'live', min: 5 } },
  { id: 'help-1', category: 'dac-biet', title: 'Người bạn tốt', hint: 'Được khen vì giúp đỡ bạn', glyph: 'hands', tier: 1, rule: { kind: 'help', min: 1 } },
  { id: 'help-5', category: 'dac-biet', title: 'Trái tim ấm áp', hint: 'Được khen 5 lần vì giúp đỡ bạn', glyph: 'heart', tier: 3, rule: { kind: 'help', min: 5 } },
];

export const BADGE_BY_ID: Record<string, BadgeDef> = /*#__PURE__*/ Object.fromEntries(BADGES.map((b) => [b.id, b]));
/** id của mọi "Huy hiệu của thầy/cô" (một HS có thể có nhiều). */
export const TEACHER_BADGE_ID = 'cua-co';

/** Số liệu đầu vào của quy tắc huy hiệu. */
export interface BadgeStats {
  /** Chuỗi ngày học dài nhất. */
  bestStreak: number;
  lessons: number;
  lessonsBySubject: Partial<Record<SubjectId, number>>;
  remediationPassed: number;
  workApproved: number;
  workTop: number;
  duels: number;
  duelWins: number;
  /** Số câu trả lời đúng ở Leo tháp. */
  towerCorrect: number;
  /** Tổng điểm thi đua dương. */
  behaviorPoints: number;
  liveClasses: number;
  helpCount: number;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  /** Chỉ "Huy hiệu của thầy/cô". */
  title?: string;
  glyph?: BadgeGlyph;
  note?: string;
  grantedBy?: string;
  grantedByName?: string;
  /** Đã xem màn chúc mừng. */
  seen: boolean;
}

export interface BadgeProgress {
  badgeId: string;
  value: number;
  min: number;
  earned: boolean;
}

export interface BadgeShelf {
  earned: UserBadge[];
  progress: BadgeProgress[];
}

export interface GrantTeacherBadgeInput {
  classId: string;
  studentIds: string[];
  title: string;
  glyph: BadgeGlyph;
  note?: string;
}

/* ======================= cửa hàng trang phục ======================= */
export type OutfitSlot = 'hat' | 'glasses' | 'neck' | 'bg';

export const OUTFIT_SLOTS: { id: OutfitSlot; name: string }[] = [
  { id: 'hat', name: 'Mũ' },
  { id: 'glasses', name: 'Kính' },
  { id: 'neck', name: 'Khăn & nơ' },
  { id: 'bg', name: 'Phông nền' },
];

export interface ShopItem {
  id: string;
  slot: OutfitSlot;
  name: string;
  /** Giá bằng xu. */
  price: number;
}

/** 20 món — trùng khớp bảng `v2.shop_items` (giá máy chủ là gốc). Hình vẽ: packages/ui/src/outfits. */
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'hat-party', slot: 'hat', name: 'Mũ sinh nhật', price: 15 },
  { id: 'hat-crown', slot: 'hat', name: 'Vương miện giấy', price: 40 },
  { id: 'hat-cap', slot: 'hat', name: 'Mũ lưỡi trai', price: 20 },
  { id: 'hat-flower', slot: 'hat', name: 'Vòng hoa', price: 25 },
  { id: 'hat-wizard', slot: 'hat', name: 'Mũ phù thủy sao', price: 50 },
  { id: 'hat-chef', slot: 'hat', name: 'Mũ đầu bếp', price: 30 },
  { id: 'glasses-round', slot: 'glasses', name: 'Kính tròn', price: 15 },
  { id: 'glasses-star', slot: 'glasses', name: 'Kính ngôi sao', price: 30 },
  { id: 'glasses-heart', slot: 'glasses', name: 'Kính trái tim', price: 30 },
  { id: 'glasses-sun', slot: 'glasses', name: 'Kính râm', price: 25 },
  { id: 'neck-bow', slot: 'neck', name: 'Nơ con bướm', price: 15 },
  { id: 'neck-scarf', slot: 'neck', name: 'Khăn len kẻ', price: 25 },
  { id: 'neck-pioneer', slot: 'neck', name: 'Khăn quàng đỏ', price: 20 },
  { id: 'neck-medal', slot: 'neck', name: 'Huy chương vàng', price: 45 },
  { id: 'neck-flowers', slot: 'neck', name: 'Vòng hoa cổ', price: 35 },
  { id: 'bg-sky', slot: 'bg', name: 'Bầu trời xanh', price: 20 },
  { id: 'bg-night', slot: 'bg', name: 'Đêm đầy sao', price: 35 },
  { id: 'bg-beach', slot: 'bg', name: 'Bãi biển', price: 35 },
  { id: 'bg-garden', slot: 'bg', name: 'Khu vườn', price: 30 },
  { id: 'bg-space', slot: 'bg', name: 'Vũ trụ', price: 60 },
];

export const SHOP_ITEM_BY_ID: Record<string, ShopItem> = /*#__PURE__*/ Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));

/** Đồ đang mặc theo ô. */
export type Outfit = Partial<Record<OutfitSlot, string>>;

export interface ShopState {
  userId: string;
  coins: number;
  owned: string[];
  outfit: Outfit;
  companion: MascotId;
}

/* ======================= Vườn lớp ======================= */
export type PlantKind = 'huong-duong' | 'sen' | 'hoa-dao' | 'cuc' | 'ca-chua' | 'xuong-rong';

export const PLANTS: { id: PlantKind; name: string }[] = [
  { id: 'huong-duong', name: 'Hoa hướng dương' },
  { id: 'sen', name: 'Hoa sen' },
  { id: 'hoa-dao', name: 'Cành hoa đào' },
  { id: 'cuc', name: 'Hoa cúc' },
  { id: 'ca-chua', name: 'Cây cà chua' },
  { id: 'xuong-rong', name: 'Xương rồng nở hoa' },
];

/** 0 hạt · 1 nảy mầm · 2 cây non · 3 ra nụ · 4 nở hoa. */
export type GrowthStage = 0 | 1 | 2 | 3 | 4;
export const GROWTH_STAGE_NAMES: Record<GrowthStage, string> = { 0: 'Hạt giống', 1: 'Nảy mầm', 2: 'Cây non', 3: 'Ra nụ', 4: 'Nở hoa' };

export interface GardenGoal {
  weekStart: string;
  targetStars: number;
  plant: PlantKind;
  /** GV đặt (false = mục tiêu mặc định). */
  custom: boolean;
}

export interface GardenPlot {
  /** id HS hoặc id tổ. */
  id: string;
  kind: 'student' | 'team';
  /** Chỉ GV thấy tên từng HS; HS chỉ thấy ô của mình và tổ mình. */
  name?: string;
  color?: string;
  mascot?: MascotId;
  stars: number;
  stage: GrowthStage;
  isMe?: boolean;
  /** Số bạn trong tổ (ô tổ). */
  members?: number;
}

export interface ClassGarden {
  classId: string;
  className: string;
  grade: number;
  weekStart: string;
  goal: GardenGoal;
  /** Tổng sao cả lớp kiếm trong tuần. */
  classStars: number;
  /** 0..1 */
  progress: number;
  stage: GrowthStage;
  /** Lớp 1–3: ô theo tổ. */
  teamMode: boolean;
  plots: GardenPlot[];
  /** Cây đã trồng thành công các tuần trước (mới trước). */
  collection: { weekStart: string; plant: PlantKind }[];
  /** Phần của HS đang xem (chỉ khi người xem là HS). */
  me?: { stars: number; stage: GrowthStage; teamId?: string };
  studentCount: number;
}

export interface SetGardenGoalInput {
  classId: string;
  targetStars: number;
  plant: PlantKind;
}

/** Nguồn dữ liệu Phase 6 — lấy bằng getRewardsSource(ds) trong @openedu/data. */
export interface RewardsSource {
  getBadgeShelf(userId: string): Promise<BadgeShelf>;
  /** Xét huy hiệu (Supabase: RPC evaluate_badges). Trả về huy hiệu chưa xem màn chúc mừng (mới đạt + của thầy/cô). */
  evaluateBadges(userId: string): Promise<UserBadge[]>;
  markBadgesSeen(userId: string, ids: string[]): Promise<void>;
  grantTeacherBadge(input: GrantTeacherBadgeInput): Promise<UserBadge[]>;
  listTeacherBadges(classId: string): Promise<UserBadge[]>;
  /** Thu hồi một "Huy hiệu của thầy/cô" đã tặng (tặng nhầm). Cần SQL 19 trên Supabase. */
  revokeTeacherBadge(badgeId: string): Promise<void>;
  getShop(userId: string): Promise<ShopState>;
  buyItem(userId: string, itemId: string): Promise<ShopState>;
  equipItem(userId: string, slot: OutfitSlot, itemId: string | null): Promise<ShopState>;
  /**
   * display 'tv': màn hình lớp — ô HS ẩn tên, ẩn số sao. tvKey: khóa TV của lớp (màn hình TV không đăng nhập,
   * migration 20261122000002_v2_garden_tv.sql). Demo: không cần đăng nhập / khóa.
   */
  getClassGarden(classId: string, opts?: { display?: 'tv'; tvKey?: string }): Promise<ClassGarden>;
  /** Khóa TV của lớp (GV lớp). renew = true: đổi khóa mới, link TV cũ ngừng hoạt động. */
  gardenTvKey?(classId: string, renew?: boolean): Promise<string>;
  setGardenGoal(input: SetGardenGoalInput): Promise<ClassGarden>;
}
