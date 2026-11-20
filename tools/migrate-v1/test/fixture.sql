-- Dữ liệu mẫu app cũ (schema public) cho kiểm thử ETL. Tên cột lẫn camelCase/snake_case như dữ liệu thật.
-- Nạp SAU supabase/tests/shim/supabase-shim.sql + supabase/migrations. Dùng bởi fixture-test.mjs.
create table public.profiles (id text primary key, name text, email text, role text, "className" text, avatar text, "savedPrompts" jsonb, allowed_grades jsonb);
create table public.parents (id text primary key, name text, email text, phone text, password text, link_code text);
create table public.parent_student_links (parent_id text, "studentId" text);
create table public.academic_years (id text primary key, name text, is_current boolean);
create table public.classes (id text primary key, name text, academic_year_id text, "teacherId" text, student_ids jsonb);
create table public.class_groups (id text primary key, class_id text, name text);
create table public.class_group_members (group_id text, student_id text);
create table public.question_bank (id serial primary key, teacher_id text, content text, type text, options jsonb, correct_option_index int, grade text, subject text, level text);
create table public.arena_questions (id text primary key, content text, answers text[], correct_index int, correct_indices int[], correct_answer_string text, type text, subject text, grade int);
create table public.exams (id text primary key, title text, teacher_id text, questions jsonb, class_id text, created_at bigint);
create table public.behavior_logs (student_id text, class_id text, points int, reason text);
create table public.arena_profiles (id text primary key, total_xp int, elo_rating int, wins int);
create table public.el_courses (id text primary key, title text, subject text, grade text, "createdBy" text, is_published boolean);
create table public.el_chapters (id text primary key, course_id text, title text, order_index int);
create table public.el_lessons (id text primary key, chapter_id text, title text, content text, "videoUrl" text, order_index int);
create table public.el_student_progress (student_id text, lesson_id text, completed boolean);

insert into public.profiles values
 ('11111111-1111-1111-1111-000000000001','Cô Hoa','hoa@school.vn','TEACHER',null,null,'["p1"]','[3]'),
 ('11111111-1111-1111-1111-000000000002','Lê An','an3a1@openedu.edu','STUDENT','3A1','http://x/a.png',null,null),
 ('11111111-1111-1111-1111-000000000003','Trần Bình','binh3a1@openedu.edu','STUDENT','3A1',null,null,null),
 ('11111111-1111-1111-1111-000000000004','Admin','admin@school.vn','ADMIN',null,null,null,null),
 ('not-a-uuid','Ma','ghost@x.vn','STUDENT',null,null,null,null);
insert into public.parents values ('22222222-2222-2222-2222-000000000001','Mẹ An','me.an@gmail.com','0900000000','plaintext','ABC');
insert into public.parent_student_links values ('22222222-2222-2222-2222-000000000001','11111111-1111-1111-1111-000000000002');
insert into public.academic_years values ('y1','2024-2025',false),('y2','2025-2026',true);
insert into public.classes values ('c_old','3A1','y1','11111111-1111-1111-1111-000000000001','[]'),
  ('c_new','3A1','y2','11111111-1111-1111-1111-000000000001','["11111111-1111-1111-1111-000000000002"]');
insert into public.class_groups values ('g1','c_new','Tổ Sao');
insert into public.class_group_members values ('g1','11111111-1111-1111-1111-000000000002');
insert into public.question_bank (teacher_id, content, type, options, correct_option_index, grade, subject, level) values
 ('11111111-1111-1111-1111-000000000001','<p>5 + 3 = ?</p>','MCQ','["7","8","9"]',1,'Lớp 3','Toán','Nhận biết'),
 ('11111111-1111-1111-1111-000000000001','Thủ đô của Việt Nam?','SHORT_ANSWER',null,null,'3','TNXH','2'),
 ('11111111-1111-1111-1111-000000000001','Bad MCQ','MCQ','["a","b"]',5,'3','Toán',null),
 ('11111111-1111-1111-1111-000000000001','Nối','MATCHING','[]',0,'3','Toán',null);
update public.question_bank set options = null where content = 'Thủ đô của Việt Nam?';
alter table public.question_bank add column correct_answer text;
update public.question_bank set correct_answer = 'Hà Nội|Ha Noi' where content = 'Thủ đô của Việt Nam?';
insert into public.arena_questions values
 ('a1','5 + 3 = ?','{7,8,9}',1,null,null,'MCQ','Toán',3),
 ('a2','Số chẵn?','{2,3,4}',null,'{0,2}',null,'MULTIPLE','Toán',3),
 ('a3','Trái đất quay quanh Mặt Trời','{}',0,null,null,'TRUE_FALSE','Khoa học',4);
insert into public.exams values ('e1','Kiểm tra','11111111-1111-1111-1111-000000000001',
 '[{"id":"q1","type":"MCQ","content":"2 x 3 = ?","options":[{"text":"5"},{"text":"6"}],"correctOptionIndex":1},
   {"id":"q2","type":"SHORT_ANSWER","content":"10 - 4 = ?","answers":["6"]},
   {"id":"q3","type":"MCQ","content":"<b>5 + 3 = ?</b>","options":["7","8","9"],"correctOptionIndex":1}]','c_new', 1730000000000);
insert into public.behavior_logs values ('11111111-1111-1111-1111-000000000002','c_new',10,'x'),('11111111-1111-1111-1111-000000000002','c_new',15,'y'),('11111111-1111-1111-1111-000000000002','c_new',-5,'z'),('11111111-1111-1111-1111-000000000003','c_new',3,'z');
insert into public.arena_profiles values ('11111111-1111-1111-1111-000000000002', 120, 1100, 3);
insert into public.el_courses values ('k1','Toán 3 - Học kì 1','Toán','3','11111111-1111-1111-1111-000000000001',true);
insert into public.el_chapters values ('ch1','k1','Chương 1',1),('ch2','k1','Chương 2',2);
insert into public.el_lessons values ('L2','ch2','Bài 2','<p>Nội dung bài 2 <img src="http://x/i.png"></p>',null,1),
  ('L1','ch1','Bài 1 video','',  'https://youtu.be/abc',1);
insert into public.el_student_progress values ('11111111-1111-1111-1111-000000000002','L1',true);

-- tài khoản auth (trigger v2 tạo hồ sơ ngay)
insert into auth.users (id, email) values
 ('11111111-1111-1111-1111-000000000001','hoa@school.vn'),('11111111-1111-1111-1111-000000000002','an3a1@openedu.edu'),
 ('11111111-1111-1111-1111-000000000003','binh3a1@openedu.edu'),('11111111-1111-1111-1111-000000000004','admin@school.vn'),
 ('22222222-2222-2222-2222-000000000001','me.an@gmail.com');

-- Kết quả bài kiểm tra, AI chấm, nhận xét TT27 (bảng app cũ)
create table public.exam_results (id text primary key, "examId" text, "studentId" text, score numeric, "totalScore" numeric,
  answers jsonb, "submittedAt" bigint, "teacherComment" text);
insert into public.exam_results values
 ('r1','e1','11111111-1111-1111-1111-000000000002', 8, 10, '{"q1":1}', 1730000500000, 'Em làm tốt'),
 ('r2','e1','11111111-1111-1111-1111-000000000003', 4.5, 10, '{}', 1730000600000, null),
 ('r3','e_missing','11111111-1111-1111-1111-000000000002', 7, 10, '{}', 1730000700000, null),
 ('r4','e1','not-a-uuid', 9, 10, '{}', 1730000800000, null);
create table public.ai_gradings (id text primary key, result_id text, student_id text, score numeric, max_score numeric,
  feedback text, model text, status text, created_at timestamptz);
insert into public.ai_gradings values
 ('g1','r1','11111111-1111-1111-1111-000000000002', 8, 10, 'Bài làm rõ ràng, cần trình bày đẹp hơn.', 'gemini-1.5-flash', 'approved', '2024-10-27'),
 ('g2','r2','11111111-1111-1111-1111-000000000003', 5, 10, 'Cần ôn phép nhân.', 'gemini-1.5-flash', 'pending', '2024-10-27'),
 ('g3','r_none','11111111-1111-1111-1111-000000000003', 5, 10, 'Mồ côi', 'gemini-1.5-flash', 'approved', '2024-10-27');
create table public.tt27_comments (id text primary key, "studentId" text, "classId" text, subject text, semester text,
  "academicYear" text, level text, score numeric, comment text, created_at timestamptz);
insert into public.tt27_comments values
 ('t1','11111111-1111-1111-1111-000000000002','c_new','Toán','Cuối kì 1','2025-2026','Hoàn thành tốt',9,'Tính nhanh, chính xác.','2026-01-10'),
 ('t2','11111111-1111-1111-1111-000000000002','c_new','Tiếng Việt','Cuối kì 1','2025-2026','HT',7,'Đọc to, rõ.','2026-01-10'),
 ('t3','11111111-1111-1111-1111-000000000002','c_new',null,'Cuối kì 1','2025-2026',null,null,'Em ngoan, chăm học.','2026-01-10'),
 ('t4','11111111-1111-1111-1111-000000000003','c_new','Toán','Giữa kì 2',null,'CHT',null,'Cần cố gắng hơn.','2026-03-15');
