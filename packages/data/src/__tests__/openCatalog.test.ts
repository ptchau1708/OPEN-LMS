import { afterEach, describe, expect, it } from 'vitest';
import { applySkillOverrides, applySubjectOverrides, customSkillCode, SKILL_BY_CODE, SKILLS, skillsFor, SUBJECT_LIST, SUBJECTS, subjectOptionsFor } from '@openedu/contracts';

afterEach(() => { applySkillOverrides([]); applySubjectOverrides({}); });

describe('Danh mục mở — kĩ năng', () => {
  it('sửa chữ, ẩn, thêm kĩ năng; gọi lại thì tính từ bản gốc', () => {
    const n = SKILLS.length;
    applySkillOverrides([
      { code: 'KH4.NL.ANH-SANG', editShort: 'Ánh sáng quanh em' },
      { code: 'KH4.NL.NHIET', hidden: true },
      { code: 'KH4.GV.TIET-KIEM-NUOC', custom: true, subject: 'khoa-hoc', grade: 4, topic: 'Chất', short: 'Tiết kiệm nước', text: 'Nêu cách tiết kiệm nước', ownerId: 'u1' },
    ]);
    expect(SKILL_BY_CODE['KH4.NL.ANH-SANG']!.short).toBe('Ánh sáng quanh em');
    expect(SKILL_BY_CODE['KH4.NL.ANH-SANG']!.edited).toBe(true);
    expect(SKILL_BY_CODE['KH4.NL.ANH-SANG']!.text).toMatch(/ánh sáng truyền qua/);
    expect(skillsFor('khoa-hoc', 4).some((s) => s.code === 'KH4.NL.NHIET')).toBe(false);
    expect(SKILL_BY_CODE['KH4.NL.NHIET']!.hidden).toBe(true);
    expect(skillsFor('khoa-hoc', 4).find((s) => s.code === 'KH4.GV.TIET-KIEM-NUOC')?.custom).toBe(true);
    expect(SKILLS.length).toBe(n);
    applySkillOverrides([]);
    expect(SKILL_BY_CODE['KH4.NL.ANH-SANG']!.short).toBe('Ánh sáng và bóng tối');
    expect(SKILL_BY_CODE['KH4.GV.TIET-KIEM-NUOC']).toBeUndefined();
    expect(SKILLS.length).toBe(n);
  });

  it('mã cho kĩ năng tự thêm: bỏ dấu, viết hoa, tránh trùng', () => {
    expect(customSkillCode('khoa-hoc', 4, 'Tiết kiệm nước')).toBe('KH4.GV.TIET-KIEM-NUOC');
    expect(customSkillCode('dao-duc', 2, 'Đi học đúng giờ!')).toBe('DD2.GV.DI-HOC-DUNG-GIO');
    expect(customSkillCode('toan', 3, 'Cộng', (c) => c === 'T3.GV.CONG')).toBe('T3.GV.CONG-2');
    expect(customSkillCode('khac', 5, '!!!')).toBe('K5.GV.KI-NANG');
  });
});

describe('Danh mục mở — môn học của trường', () => {
  it('đổi tên, ẩn, hiện lại', () => {
    applySubjectOverrides({ khac: { name: 'Giáo dục địa phương', short: 'GDĐP' }, tnxh: { hidden: true } });
    expect(SUBJECTS.khac.name).toBe('Giáo dục địa phương');
    expect(SUBJECTS.khac.short).toBe('GDĐP');
    expect(SUBJECT_LIST.some((s) => s.id === 'tnxh')).toBe(false);
    expect(subjectOptionsFor(2).some((s) => s.id === 'tnxh')).toBe(false);
    expect(subjectOptionsFor(2, ['tnxh']).some((s) => s.id === 'tnxh')).toBe(true);
    applySubjectOverrides({});
    expect(SUBJECTS.khac.name).toBe('Khác');
    expect(SUBJECT_LIST.some((s) => s.id === 'tnxh')).toBe(true);
  });
});
