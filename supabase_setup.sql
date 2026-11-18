-- 在原 Supabase 專案 SQL Editor 執行。保留既有會員及研究表。
begin;
create schema if not exists lotto_sync_private;
revoke all on schema lotto_sync_private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  tier text not null default 'free' check (tier in ('free', 'vip')),
  vip_expire_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.user_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  backup_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(backup_data) = 'object' and octet_length(backup_data::text) <= 10485760),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.user_backups enable row level security;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
-- 僅開放個人資料欄位。禁止會員用 REST 自行升級 VIP。
grant update (display_name, avatar_url) on public.profiles to authenticated;
revoke all on public.user_backups from public, anon, authenticated;
grant select, insert, update on public.user_backups to authenticated;

create policy lotto_sync_profile_read on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy lotto_sync_profile_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy lotto_sync_backup_read on public.user_backups for select to authenticated
  using ((select auth.uid()) = user_id);
create policy lotto_sync_backup_insert on public.user_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy lotto_sync_backup_update on public.user_backups for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function lotto_sync_private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'display_name','會員'),
    coalesce(new.raw_user_meta_data->>'picture',new.raw_user_meta_data->>'avatar_url'))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function lotto_sync_private.create_profile() from public, anon, authenticated;
create trigger lotto_sync_new_member after insert on auth.users
  for each row execute function lotto_sync_private.create_profile();

create function lotto_sync_private.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if tg_table_name = 'user_backups' then
    if tg_op = 'UPDATE' then new.revision := old.revision + 1;
    else new.revision := 1;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function lotto_sync_private.stamp_row() from public, anon, authenticated;
create trigger lotto_sync_profile_stamp before update on public.profiles
  for each row execute function lotto_sync_private.stamp_row();
create trigger lotto_sync_backup_stamp before insert or update on public.user_backups
  for each row execute function lotto_sync_private.stamp_row();

-- 舊 Email 會員登入同一帳號時也有個人資料，不產生新 auth.users。
insert into public.profiles (id, display_name, avatar_url)
select id, coalesce(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name','會員'),
  coalesce(raw_user_meta_data->>'picture',raw_user_meta_data->>'avatar_url')
from auth.users on conflict (id) do nothing;

-- 樂觀鎖。兩台裝置同時寫入時，舊版本回傳衝突並重新合併。
create function public.lotto_sync_save_backup(p_data jsonb, p_revision bigint)
returns setof public.user_backups language plpgsql security invoker set search_path = '' as $$
declare saved public.user_backups;
begin
  if auth.uid() is null then raise exception 'Login required' using errcode = '42501'; end if;
  if p_revision = 0 then
    insert into public.user_backups (user_id,backup_data)
    values (auth.uid(),p_data) on conflict (user_id) do nothing returning * into saved;
  else
    update public.user_backups set backup_data=p_data
    where user_id=auth.uid() and revision=p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
  return next saved;
end;
$$;
revoke all on function public.lotto_sync_save_backup(jsonb,bigint) from public, anon;
grant execute on function public.lotto_sync_save_backup(jsonb,bigint) to authenticated;
commit;
