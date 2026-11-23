-- =============================================================================
-- OPEN-EDU v2 — Trang học dạng cây (như Google Sites) — 23/11/2026, docs/TRANG_HOC.md
--  • class_pages.parent_id: trang con nằm trong trang cha (cùng lớp, sâu tối đa 4 tầng, không vòng lặp).
--    Xóa trang cha → các trang con lên một tầng (không mất).
--  • kind 'section': trang nội dung (tiêu đề + phần chữ) chứa các trang con; không cần địa chỉ.
--  • body: phần chữ của trang (tối đa 20 000 kí tự).
-- Chạy lại nhiều lần không sao.
-- =============================================================================

alter table v2.class_pages add column if not exists parent_id uuid references v2.class_pages(id) on delete set null;
alter table v2.class_pages add column if not exists body text not null default '';
create index if not exists class_pages_parent_idx on v2.class_pages (parent_id) where parent_id is not null;

-- Nới hai ràng buộc cũ (kind chỉ link/lti; link phải có url, lti phải có app) để có thêm 'section'.
do $$
declare c record;
begin
  for c in select conname, pg_get_constraintdef(oid) d from pg_constraint
           where conrelid = 'v2.class_pages'::regclass and contype = 'c'
  loop
    if c.d ilike '%kind%' and (c.d ilike '%''lti''%') and c.conname not in ('class_pages_kind_chk', 'class_pages_target_chk') then
      execute format('alter table v2.class_pages drop constraint %I', c.conname);
    end if;
  end loop;
end $$;
do $$ begin
  alter table v2.class_pages add constraint class_pages_kind_chk check (kind in ('link', 'lti', 'section'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table v2.class_pages add constraint class_pages_target_chk check ((kind = 'link' and url is not null) or (kind = 'lti' and app_id is not null) or kind = 'section');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table v2.class_pages add constraint class_pages_body_chk check (length(body) <= 20000);
exception when duplicate_object then null; end $$;

-- Trang cha: cùng lớp, không tự làm cha mình, không vòng lặp, sâu tối đa 4 tầng.
create or replace function v2.class_pages_tree_check() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare v_cur uuid := new.parent_id; v_depth int := 1; v_class text;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'Trang không nằm trong chính nó được.' using errcode = '23514'; end if;
  select class_id into v_class from v2.class_pages where id = new.parent_id;
  if v_class is null or v_class <> new.class_id then raise exception 'Trang cha phải thuộc cùng lớp.' using errcode = '23514'; end if;
  while v_cur is not null loop
    if v_cur = new.id then raise exception 'Không chuyển trang vào trong trang con của nó được.' using errcode = '23514'; end if;
    v_depth := v_depth + 1;
    if v_depth > 4 then raise exception 'Trang con sâu tối đa 4 tầng.' using errcode = '23514'; end if;
    select parent_id into v_cur from v2.class_pages where id = v_cur;
  end loop;
  return new;
end $$;
drop trigger if exists class_pages_tree on v2.class_pages;
create trigger class_pages_tree before insert or update of parent_id, class_id on v2.class_pages
  for each row execute function v2.class_pages_tree_check();
revoke all on function v2.class_pages_tree_check() from public, anon, authenticated;
