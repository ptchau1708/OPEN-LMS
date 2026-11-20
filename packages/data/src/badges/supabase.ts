/**
 * Phase 6 — RewardsSource trên Supabase (migration 20261113000009_v2_rewards.sql). Mọi ghi đều qua RPC
 * security definer: HS không tự cấp huy hiệu, đồ, hay sửa xu. RPC trả JSON camelCase sẵn.
 * ⚠ Đã kiểm thử pgTAP trên Postgres 16; chưa chạy với project Supabase thật.
 */
import type {
  BadgeShelf,
  BadgeStats,
  ClassGarden,
  GrantTeacherBadgeInput,
  OutfitSlot,
  RewardsSource,
  SetGardenGoalInput,
  ShopState,
  UserBadge,
} from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { anonymizeGarden, assembleGarden, badgeProgress, type GardenRaw } from './rules';

interface PgError { message: string; code?: string }
function fail(e: PgError, vi: string): never {
  if (e.message && /[À-ỹ]/.test(e.message)) throw new Error(e.message);
  throw new Error(e.message ? `${vi} (${e.message})` : vi);
}

export class SupabaseRewardsSource implements RewardsSource {
  private clientP: Promise<V2Client>;
  constructor(client?: V2Client | Promise<V2Client>) {
    this.clientP = client ? Promise.resolve(client) : getSupabaseClient();
  }
  private async rpc<T>(fn: string, args: Record<string, unknown>, vi: string): Promise<T> {
    const sb = await this.clientP;
    const { data, error } = await sb.rpc(fn, args);
    if (error) fail(error, vi);
    return data as T;
  }

  async getBadgeShelf(userId: string): Promise<BadgeShelf> {
    const r = await this.rpc<{ stats: BadgeStats; earned: UserBadge[] }>('get_badge_shelf', { p_user: userId }, 'Chưa tải được huy hiệu.');
    return { earned: r.earned ?? [], progress: badgeProgress(r.stats) };
  }
  async evaluateBadges(_userId: string): Promise<UserBadge[]> {
    return (await this.rpc<UserBadge[]>('evaluate_badges', {}, 'Chưa xét được huy hiệu.')) ?? [];
  }
  async markBadgesSeen(_userId: string, ids: string[]): Promise<void> {
    await this.rpc('mark_badges_seen', { p_ids: ids }, 'Chưa lưu được.');
  }
  async grantTeacherBadge(i: GrantTeacherBadgeInput): Promise<UserBadge[]> {
    return this.rpc('grant_teacher_badge', { p_class: i.classId, p_students: i.studentIds, p_title: i.title, p_glyph: i.glyph, p_note: i.note ?? null }, 'Chưa tặng được huy hiệu.');
  }
  async listTeacherBadges(classId: string): Promise<UserBadge[]> {
    return (await this.rpc<UserBadge[]>('list_teacher_badges', { p_class: classId }, 'Chưa tải được huy hiệu.')) ?? [];
  }
  async getShop(_userId: string): Promise<ShopState> {
    return this.rpc('get_shop', {}, 'Chưa mở được cửa hàng.');
  }
  async buyItem(_userId: string, itemId: string): Promise<ShopState> {
    return this.rpc('buy_item', { p_item: itemId }, 'Chưa đổi được món này.');
  }
  async equipItem(_userId: string, slot: OutfitSlot, itemId: string | null): Promise<ShopState> {
    return this.rpc('equip_item', { p_slot: slot, p_item: itemId }, 'Chưa mặc được món này.');
  }
  async getClassGarden(classId: string, opts: { display?: 'tv' } = {}): Promise<ClassGarden> {
    const g = assembleGarden(await this.rpc<GardenRaw>('get_class_garden', { p_class: classId }, 'Chưa mở được Vườn lớp. Màn hình lớp cần đăng nhập tài khoản giáo viên.'));
    return opts.display === 'tv' ? anonymizeGarden(g) : g;
  }
  async setGardenGoal(i: SetGardenGoalInput): Promise<ClassGarden> {
    return assembleGarden(await this.rpc<GardenRaw>('set_garden_goal', { p_class: i.classId, p_target: i.targetStars, p_plant: i.plant }, 'Chưa lưu được mục tiêu.'));
  }
}
