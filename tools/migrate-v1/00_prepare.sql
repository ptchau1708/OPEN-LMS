-- =============================================================================
-- migrate-v1 · Bước 0 · Chuẩn bị: schema tạm v1etl + hàm an toàn + VIEW chuẩn hóa dữ liệu cũ
--
-- Bảng cũ (schema public) có cột lúc camelCase lúc snake_case (đã đổi tên bằng script), vài bảng tạo tay
-- trên Dashboard. Ở đây mỗi bảng cũ được "chuẩn hóa" thành một VIEW v1etl.<tên> với cột cố định:
--   • tìm cột có thật qua information_schema, gộp các cách đặt tên bằng coalesce(...)
--   • ép kiểu an toàn (lỗi → null) cho số, ngày giờ, JSON, mảng
--   • bảng không tồn tại → VIEW rỗng (các bước sau vẫn chạy được)
-- Chạy lại bao nhiêu lần cũng được. Không sửa gì trong schema public.
-- =============================================================================

create schema if not exists v1etl;
comment on schema v1etl is 'Schema tạm cho chuyển dữ liệu OpenLMS → v2. Xóa bằng 99_cleanup.sql.';

-- ---------- kiểm tra bảng/cột ----------
create or replace function v1etl.has_table(p_table text) returns boolean
language sql stable as $$
  select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = p_table)
$$;

create or replace function v1etl.has_col(p_table text, p_col text) returns boolean
language sql stable as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_col)
$$;

-- ---------- ép kiểu an toàn (mọi đầu vào là text) ----------
create or replace function v1etl.try_jsonb(p text) returns jsonb
language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  begin
    return p::jsonb;
  exception when others then
    begin
      return to_jsonb(p::text[]);   -- mảng Postgres dạng {a,b}
    exception when others then
      return to_jsonb(p);           -- chuỗi thường
    end;
  end;
end $$;

create or replace function v1etl.try_int(p text) returns int
language sql immutable as $$
  select case when p ~ '^\s*-?\d{1,9}(\.\d+)?\s*$' then round(p::numeric)::int end
$$;

create or replace function v1etl.try_ts(p text) returns timestamptz
language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  if p ~ '^\s*\d{12,14}\s*$' then return to_timestamp(btrim(p)::bigint / 1000.0); end if; -- epoch ms (JS)
  if p ~ '^\s*\d{9,11}\s*$' then return to_timestamp(btrim(p)::bigint); end if;          -- epoch s
  return p::timestamptz;
exception when others then
  return null;
end $$;

create or replace function v1etl.try_bool(p text) returns boolean
language sql immutable as $$
  select case
    when lower(btrim(p)) in ('t', 'true', '1', 'yes', 'y', 'published', 'active', 'public') then true
    when lower(btrim(p)) in ('f', 'false', '0', 'no', 'n', 'draft', 'inactive', 'private', 'hidden') then false
  end
$$;

-- Mảng chuỗi từ text[] / uuid[] / JSON array / "a,b,c".
create or replace function v1etl.text_array(p text) returns text[]
language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return '{}'; end if;
  if left(btrim(p), 1) = '[' then
    return array(
      select btrim(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e::text end)
      from jsonb_array_elements(p::jsonb) e);
  end if;
  if left(btrim(p), 1) = '{' then
    return array(select btrim(x) from unnest(p::text[]) x where x is not null);
  end if;
  return array(select btrim(x) from unnest(string_to_array(p, ',')) x where btrim(x) <> '');
exception when others then
  return '{}';
end $$;

-- ---------- chữ ----------
create or replace function v1etl.strip_html(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(regexp_replace(coalesce(p, ''), '<\s*(br|/p|/div|/li|/h[1-6])\s*/?>', E'\n', 'gi'), '<[^>]*>', '', 'g'),
      '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&apos;', ''''),
    '[ \t\r]+', ' ', 'g'), '\s*\n\s*', E'\n', 'g'), E' \t\r\n'), '')
$$;

create or replace function v1etl.first_img(p text) returns text
language sql immutable as $$
  select substring(coalesce(p, '') from '<img[^>]+src\s*=\s*["'']([^"'']+)["'']')
$$;

create or replace function v1etl.first_iframe(p text) returns text
language sql immutable as $$
  select substring(coalesce(p, '') from '<iframe[^>]+src\s*=\s*["'']([^"'']+)["'']')
$$;

create or replace function v1etl.norm(p text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(coalesce(v1etl.strip_html(p), ''), '\s+', ' ', 'g')))
$$;

-- ---------- ánh xạ giá trị ----------
create or replace function v1etl.map_role(p text) returns text
language sql immutable as $$
  select case upper(btrim(coalesce(p, '')))
    when 'ADMIN' then 'admin' when 'TEACHER' then 'teacher' when 'PARENT' then 'parent' else 'student' end
$$;

create or replace function v1etl.map_subject(p text) returns text
language sql immutable as $$
  select case
    when p is null then 'khac'
    when lower(p) ~ '(toán|toan|math)' then 'toan'
    when lower(p) ~ '(tiếng việt|tieng viet|tiếng-việt|tieng-viet|văn|van hoc|vietnamese)' then 'tieng-viet'
    when lower(p) ~ '(tiếng anh|tieng anh|tieng-anh|english|anh văn|anh van)' then 'tieng-anh'
    when lower(p) ~ '(tự nhiên và xã hội|tu nhien va xa hoi|tnxh|tn&xh|tn-xh)' then 'tnxh'
    when lower(p) ~ '(khoa học|khoa hoc|khoa-hoc|science)' then 'khoa-hoc'
    when lower(p) ~ '(mĩ thuật|mỹ thuật|mi thuat|my thuat|mi-thuat|art)' then 'mi-thuat'
    when lower(p) ~ '(âm nhạc|am nhac|am-nhac|music)' then 'am-nhac'
    else 'khac' end
$$;

-- '3', 'Lớp 3', '3A2', 'grade 3' → 3. Chỉ nhận chữ số 1–5 đứng riêng (không nhận '12').
create or replace function v1etl.map_grade(p text) returns smallint
language sql immutable as $$
  select (substring(coalesce(p, '') from '(?:^|\D)([1-5])(?:\D|$)'))::smallint
$$;

create or replace function v1etl.map_difficulty(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when lower(p) ~ '(nhận biết|nhan biet|easy|dễ|^1$|mức 1|muc 1|level ?1)' then 'nhan-biet'
    when lower(p) ~ '(thông hiểu|thong hieu|kết nối|ket noi|medium|trung bình|^2$|mức 2|muc 2|level ?2)' then 'ket-noi'
    when lower(p) ~ '(vận dụng|van dung|hard|khó|^3$|^4$|mức 3|muc 3|level ?3)' then 'van-dung'
  end
$$;

-- ---------- câu hỏi cũ → { type, payload, key } của v2 (null = không chuyển được) ----------
-- p_options: mảng lựa chọn (chuỗi hoặc {text|content|label}); p_idx: chỉ số đúng (0-based);
-- p_multi: các chỉ số đúng (chọn nhiều); p_answer: đáp án dạng chữ (điền ngắn, hoặc chữ của lựa chọn đúng).
create or replace function v1etl.make_item(p_type text, p_options jsonb, p_idx int, p_multi text[], p_answer text) returns jsonb
language plpgsql immutable as $$
declare
  t text := upper(coalesce(p_type, ''));
  opts jsonb := '[]'::jsonb;
  n int;
  e jsonb;
  i int := 0;
  txt text;
  img text;
  multi int[];
  ans text[];
  idx int := p_idx;
begin
  -- Dạng chưa có cách chuyển an toàn → bỏ qua (báo trong 90_verify.sql).
  if t ~ '(MATCH|ORDER|SORT|DRAG|CLASSIF|HOTSPOT|DRAW|RECORD|SPEAK|AUDIO|PAIR|ESSAY_LONG)' then
    return null;
  end if;

  if jsonb_typeof(p_options) = 'array' then
    for e in select value from jsonb_array_elements(p_options) loop
      exit when i >= 26;
      txt := case jsonb_typeof(e)
        when 'string' then e #>> '{}'
        when 'number' then e::text
        when 'object' then coalesce(e ->> 'text', e ->> 'content', e ->> 'label', e ->> 'value', e ->> 'answer')
      end;
      img := case when jsonb_typeof(e) = 'object' then nullif(coalesce(e ->> 'image', e ->> 'imageUrl', e ->> 'image_url'), '') end;
      txt := v1etl.strip_html(txt);
      if img is null and txt ~* '^https?://\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$' then
        img := txt;
        txt := null;
      end if;
      opts := opts || jsonb_build_array(v2.jsonb_compact(jsonb_build_object('id', chr(97 + i), 'text', txt, 'image', img)));
      i := i + 1;
    end loop;
  end if;
  n := jsonb_array_length(opts);
  multi := array(select v1etl.try_int(x) from unnest(coalesce(p_multi, '{}')) x where v1etl.try_int(x) is not null);

  -- Đúng / Sai
  if t ~ '(TRUE.?FALSE|^TF$|BOOLEAN|DUNG.?SAI)' then
    if n = 0 then
      opts := '[{"id":"a","text":"Đúng"},{"id":"b","text":"Sai"}]'::jsonb;
      n := 2;
    end if;
    if idx is null and p_answer is not null then
      idx := case when lower(btrim(p_answer)) in ('true', 'đúng', 'dung', 't', '1', 'a') then 0
                  when lower(btrim(p_answer)) in ('false', 'sai', 'f', '0', 'b') then 1 end;
    end if;
    t := 'MCQ';
  end if;

  -- Chọn nhiều
  if t ~ '(MULTI|CHECKBOX)' or cardinality(multi) > 1 then
    if n < 2 or cardinality(multi) = 0 or exists (select 1 from unnest(multi) m where m < 0 or m >= n) then
      return null;
    end if;
    return jsonb_build_object(
      'type', 'MCQ_MULTIPLE',
      'payload', jsonb_build_object('options', opts),
      'key', jsonb_build_object('correct', to_jsonb(array(select distinct chr(97 + m) from unnest(multi) m order by 1))));
  end if;

  -- Điền ngắn
  if t ~ '(SHORT|FILL|TEXT|INPUT|ESSAY|BLANK)' or (n = 0 and p_answer is not null) then
    ans := array(
      select btrim(x) from unnest(regexp_split_to_array(coalesce(v1etl.strip_html(p_answer), ''), '\s*[|;]\s*')) x
      where btrim(x) <> '');
    if cardinality(ans) = 0 then return null; end if;
    return jsonb_build_object(
      'type', 'SHORT_ANSWER',
      'payload', case when ans[1] ~ '^-?\d+([.,]\d+)?$' then '{"inputMode":"numeric"}'::jsonb else '{}'::jsonb end,
      'key', jsonb_build_object('accepted', to_jsonb(ans)));
  end if;

  -- Chọn 1
  if n < 2 then return null; end if;
  if exists (select 1 from jsonb_array_elements(opts) o where not (o ? 'text') and not (o ? 'image')) then
    return null; -- có lựa chọn rỗng
  end if;
  if idx is null and cardinality(multi) = 1 then idx := multi[1]; end if;
  if idx is null and p_answer is not null then
    select (o.ord - 1)::int into idx
    from jsonb_array_elements(opts) with ordinality as o(v, ord)
    where lower(o.v ->> 'text') = lower(v1etl.strip_html(p_answer)) limit 1;
    if idx is null and btrim(p_answer) ~* '^[a-z]$' then idx := ascii(lower(btrim(p_answer))) - 97; end if;
  end if;
  if idx is null or idx < 0 or idx >= n then return null; end if;
  return jsonb_build_object(
    'type', 'MCQ',
    'payload', jsonb_build_object('options', opts),
    'key', jsonb_build_object('correct', chr(97 + idx)));
end $$;

-- ---------- dựng VIEW chuẩn hóa ----------
-- p_kind: text | jsonb | int | ts | bool | text[]
create or replace function v1etl.col(p_table text, p_variants text[], p_kind text) returns text
language plpgsql stable as $$
declare
  v text;
  e text;
  parts text[] := '{}';
begin
  foreach v in array p_variants loop
    if v1etl.has_col(p_table, v) then
      e := format('t.%I::text', v);
      e := case p_kind
        when 'jsonb' then format('v1etl.try_jsonb(%s)', e)
        when 'int' then format('v1etl.try_int(%s)', e)
        when 'ts' then format('v1etl.try_ts(%s)', e)
        when 'bool' then format('v1etl.try_bool(%s)', e)
        when 'text[]' then format('nullif(v1etl.text_array(%s), %L::text[])', e, '{}')
        else format('nullif(btrim(%s), %L)', e, '')
      end;
      parts := parts || e;
    end if;
  end loop;
  if cardinality(parts) = 0 then
    return 'null::' || case p_kind when 'int' then 'int' when 'ts' then 'timestamptz' when 'bool' then 'boolean'
                                   when 'jsonb' then 'jsonb' when 'text[]' then 'text[]' else 'text' end;
  end if;
  if cardinality(parts) = 1 then return parts[1]; end if;
  return 'coalesce(' || array_to_string(parts, ', ') || ')';
end $$;

-- p_cols: [["tên_cột_mới", "kiểu", "biến_thể_1", "biến_thể_2", ...], ...]
create or replace function v1etl.build_view(p_view text, p_table text, p_cols jsonb) returns text
language plpgsql as $$
declare
  c jsonb;
  sel text[] := '{}';
  found_cols text[] := '{}';
  src text;
begin
  for c in select value from jsonb_array_elements(p_cols) loop
    sel := sel || (v1etl.col(p_table,
                     array(select x from jsonb_array_elements_text(c) with ordinality as a(x, n) where n > 2 order by n),
                     c ->> 1) || ' as ' || quote_ident(c ->> 0));
    if v1etl.col(p_table, array(select x from jsonb_array_elements_text(c) with ordinality as a(x, n) where n > 2 order by n), 'text') <> 'null::text' then
      found_cols := found_cols || (c ->> 0);
    end if;
  end loop;
  src := case when v1etl.has_table(p_table) then format('from public.%I t', p_table) else 'from (select 1) t where false' end;
  execute format('drop view if exists v1etl.%I cascade', p_view);
  execute format('create view v1etl.%I as select %s %s', p_view, array_to_string(sel, ', '), src);
  return case when v1etl.has_table(p_table)
    then format('public.%s → v1etl.%s (cột tìm thấy: %s)', p_table, p_view, array_to_string(found_cols, ', '))
    else format('public.%s KHÔNG CÓ → v1etl.%s rỗng', p_table, p_view) end;
end $$;

-- Kết quả bước này là danh sách bảng/cột tìm thấy — kiểm tra trước khi chạy tiếp.
select src as "nguồn dữ liệu cũ" from (values
  (v1etl.build_view('profiles', 'profiles', '[
    ["id","text","id"],
    ["name","text","name","full_name","fullName","display_name","displayName"],
    ["email","text","email"],
    ["role","text","role"],
    ["class_name","text","class_name","className","class"],
    ["class_id","text","class_id","classId"],
    ["grade","text","grade","grade_level","gradeLevel"],
    ["avatar","text","avatar","avatar_url","avatarUrl"],
    ["saved_prompts","jsonb","saved_prompts","savedPrompts"],
    ["custom_tools","jsonb","custom_tools","customTools"],
    ["allowed_grades","jsonb","allowed_grades","allowedGrades"],
    ["hidden_topics","jsonb","hidden_topics","hiddenTopics"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('parents', 'parents', '[
    ["id","text","id"],
    ["name","text","name","full_name","fullName"],
    ["email","text","email"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('parent_links', 'parent_student_links', '[
    ["parent_id","text","parent_id","parentId"],
    ["student_id","text","student_id","studentId"]]')),
  (v1etl.build_view('academic_years', 'academic_years', '[
    ["id","text","id"],
    ["name","text","name","title","year","label"],
    ["start_date","ts","start_date","startDate","start"],
    ["is_current","bool","is_current","isCurrent","is_active","isActive","active","current"]]')),
  (v1etl.build_view('classes', 'classes', '[
    ["id","text","id"],
    ["name","text","name","class_name","className"],
    ["academic_year_id","text","academic_year_id","academicYearId","year_id"],
    ["teacher_id","text","teacher_id","teacherId","homeroom_teacher_id"],
    ["student_ids","text[]","student_ids","studentIds","students"],
    ["grade","text","grade","grade_level","gradeLevel","level"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('class_groups', 'class_groups', '[
    ["id","text","id"],
    ["class_id","text","class_id","classId"],
    ["name","text","name","title"],
    ["color","text","color"],
    ["position","int","order_index","orderIndex","position","sort_order"]]')),
  (v1etl.build_view('class_group_members', 'class_group_members', '[
    ["group_id","text","group_id","groupId","class_group_id","classGroupId"],
    ["student_id","text","student_id","studentId","user_id","userId"]]')),
  (v1etl.build_view('question_bank', 'question_bank', '[
    ["id","text","id"],
    ["teacher_id","text","teacher_id","teacherId","created_by","createdBy","owner_id","ownerId","author_id"],
    ["content","text","content","question","text","question_text","questionText"],
    ["type","text","type","question_type","questionType"],
    ["options","jsonb","options","choices","answers"],
    ["correct_index","int","correct_option_index","correctOptionIndex","correct_index","correctIndex","correct_answer_index","correctAnswerIndex"],
    ["correct_indices","text[]","correct_indices","correctIndices","correct_option_indices","correctOptionIndices"],
    ["correct_answer","text","correct_answer","correctAnswer","correct_answer_string","correctAnswerString","answer"],
    ["grade","text","grade","grade_level","gradeLevel","class_level"],
    ["subject","text","subject","subject_name","subjectName"],
    ["topic","text","topic","chapter"],
    ["level","text","level","difficulty","cognitive_level"],
    ["explanation","text","explanation","explain","solution"],
    ["image","text","image","image_url","imageUrl"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('arena_questions', 'arena_questions', '[
    ["id","text","id"],
    ["teacher_id","text","created_by","createdBy","teacher_id","teacherId"],
    ["content","text","content","question","text"],
    ["type","text","type","question_type","questionType"],
    ["options","jsonb","answers","options","choices"],
    ["correct_index","int","correct_index","correctIndex","correct_option_index","correctOptionIndex"],
    ["correct_indices","text[]","correct_indices","correctIndices"],
    ["correct_answer","text","correct_answer_string","correctAnswerString","correct_answer","correctAnswer"],
    ["grade","text","grade","grade_level","gradeLevel"],
    ["subject","text","subject"],
    ["topic","text","topic"],
    ["level","text","difficulty","level"],
    ["explanation","text","explanation","explain"],
    ["image","text","image","image_url","imageUrl"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('exams', 'exams', '[
    ["id","text","id"],
    ["title","text","title","name"],
    ["teacher_id","text","teacher_id","teacherId","created_by","createdBy"],
    ["questions","jsonb","questions","question_list","questionList"],
    ["category","text","category"],
    ["subject","text","subject"],
    ["grade","text","grade","grade_level","gradeLevel"],
    ["class_id","text","class_id","classId"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('behavior_logs', 'behavior_logs', '[
    ["student_id","text","student_id","studentId","user_id","userId"],
    ["points","int","points","point","score","value","delta"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('arena_profiles', 'arena_profiles', '[
    ["user_id","text","user_id","userId","student_id","studentId","id"],
    ["elo_rating","int","elo_rating","eloRating","elo"],
    ["total_xp","int","total_xp","totalXp","xp"],
    ["tower_floor","int","tower_floor","towerFloor"],
    ["wins","int","wins"],
    ["losses","int","losses"]]')),
  (v1etl.build_view('el_courses', 'el_courses', '[
    ["id","text","id"],
    ["title","text","title","name"],
    ["description","text","description"],
    ["subject","text","subject"],
    ["grade","text","grade","grade_level","gradeLevel"],
    ["teacher_id","text","teacher_id","teacherId","created_by","createdBy","author_id","authorId","owner_id"],
    ["status","text","status"],
    ["is_published","bool","is_published","isPublished","published"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('el_chapters', 'el_chapters', '[
    ["id","text","id"],
    ["course_id","text","course_id","courseId"],
    ["title","text","title","name"],
    ["position","int","order_index","orderIndex","position","sort_order","sortOrder","order"]]')),
  (v1etl.build_view('el_lessons', 'el_lessons', '[
    ["id","text","id"],
    ["chapter_id","text","chapter_id","chapterId"],
    ["course_id","text","course_id","courseId"],
    ["title","text","title","name"],
    ["content","text","content","body","html","content_html","contentHtml"],
    ["video_url","text","video_url","videoUrl","video","youtube_url","youtubeUrl","media_url"],
    ["type","text","type","lesson_type","lessonType","kind"],
    ["position","int","order_index","orderIndex","position","sort_order","sortOrder","order"],
    ["duration","int","duration_minutes","durationMinutes","duration"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('el_progress', 'el_student_progress', '[
    ["student_id","text","student_id","studentId","user_id","userId"],
    ["lesson_id","text","lesson_id","lessonId"],
    ["completed","bool","completed","is_completed","isCompleted","done"],
    ["progress","int","progress","percent","progress_percent"],
    ["completed_at","ts","completed_at","completedAt","updated_at","updatedAt"]]'))
) as v(src);
