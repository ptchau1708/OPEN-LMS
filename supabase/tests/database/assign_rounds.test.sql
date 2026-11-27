-- pgTAP: giao lại nhiều lượt + chính sách quá hạn (migration 20261123000001_v2_assign_rounds.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000d2-0000-0000-0000-000000000001', 'ar-gv@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000d3-0000-0000-0000-000000000001', 'aran@openlms.edu', '{"role":"student","name":"An"}'),
  ('000000d3-0000-0000-0000-000000000002', 'arbinh@openlms.edu', '{"role":"student","name":"Bình"}');
insert into v2.classes (id, name, grade, teacher_id) values ('ar-5a', '5A', 5, '000000d2-0000-0000-0000-000000000001');
insert into v2.class_members (class_id, user_id, role) values ('ar-5a', '000000d3-0000-0000-0000-000000000001', 'student');
insert into v2.lessons (id, title, subject, grade, owner_id, status) values ('ar-l1', 'Luyện tập', 'toan', 5, '000000d2-0000-0000-0000-000000000001', 'published');
insert into v2.lesson_progress (user_id, lesson_id, slide_index, completed_slides, answers, completed_at, updated_at)
  values ('000000d3-0000-0000-0000-000000000001', 'ar-l1', 3, '{s1,s2,s3}', '{"s1":{"correct":true,"score":1}}', now() - interval '3 days', now() - interval '3 days');
insert into v2.assignments (id, target_type, target_id, title, class_id, open_at, due_at, created_by) values
  ('ar-a1', 'lesson', 'ar-l1', 'Lượt 1', 'ar-5a', now() - interval '5 days', now() - interval '4 days', '000000d2-0000-0000-0000-000000000001');
insert into v2.assignments (id, target_type, target_id, title, class_id, open_at, due_at, created_by, parent_id, round, late_policy) values
  ('ar-a2', 'lesson', 'ar-l1', 'Lượt 2', 'ar-5a', now() - interval '1 hour', now() + interval '2 days', '000000d2-0000-0000-0000-000000000001', 'ar-a1', 2, 'allow'),
  ('ar-a3', 'lesson', 'ar-l1', 'Khóa', 'ar-5a', now() - interval '2 days', now() - interval '1 day', '000000d2-0000-0000-0000-000000000001', 'ar-a1', 3, 'lock');

select throws_ok($$ insert into v2.assignments (target_type, target_id, title, class_id, late_policy) values ('lesson', 'ar-l1', 'x', 'ar-5a', 'gì đó') $$, '23514', null, 'chính sách quá hạn chỉ allow / lock');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000d3-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.start_assignment('ar-a1'))->>'reset', 'false', 'lượt cũ: không xóa tiến độ (đã làm sau ngày mở)');
select is((v2.start_assignment('ar-a2'))->>'reset', 'true', 'lượt mới: tiến độ cũ được làm lại từ đầu');
select is((select completed_slides from v2.lesson_progress where lesson_id = 'ar-l1'), '{}'::text[], 'tiến độ về 0');
select is((select answers from v2.lesson_progress where lesson_id = 'ar-l1'), '{}'::jsonb, 'câu trả lời cũ của bài được xóa (kết quả cũ vẫn trong learning_events)');
select is((v2.start_assignment('ar-a2'))->>'reset', 'false', 'mở lại lượt đang làm: không xóa nữa');
select throws_ok($$ select v2.start_assignment('ar-a3') $$, 'P0001', 'Bài này đã hết hạn nộp. Em hỏi thầy/cô nhé.', 'quá hạn + khóa → không mở được');

select set_config('request.jwt.claims', '{"sub":"000000d3-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.start_assignment('ar-a2') $$, 'P0002', null, 'HS lớp khác không mở được');

set local role anon;
select throws_ok($$ select v2.start_assignment('ar-a2') $$, '42501', null, 'khách không gọi được');

select * from finish();
rollback;
