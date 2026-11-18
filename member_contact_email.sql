-- Email 為聯絡用途，不變更 auth.users 登入身分。
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add constraint profiles_contact_email_format check
(contact_email is null or (length(contact_email)<=254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'));
grant update(contact_email) on public.profiles to authenticated;
comment on column public.profiles.contact_email is 'Member supplied contact and future invoice delivery email. Not an authentication identity or verified email. Sending and invoicing require separate integration.';

