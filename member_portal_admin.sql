create or replace function lab3_private.member_admin_portal(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; t uuid; old lab3_private.members%rowtype; result jsonb;
begin
 c:=lab3_private.context();
 if c->>'role' not in ('super_admin','admin') then raise exception '需要管理員權限' using errcode='42501';end if;
 if coalesce(p->>'action','list')='list' then
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(pr.display_name,m.email,'會員'),'contact_email',pr.contact_email,'role',m.role,'enabled',m.enabled) order by m.created_at),'[]'::jsonb) into result
 from lab3_private.members m left join public.profiles pr on pr.id=m.user_id where m.user_id is not null;
 return result;
 end if;
 if c->>'role'<>'super_admin' then raise exception '僅總管理員可修改' using errcode='42501';end if;
 if p->>'action'<>'update' or p->>'role' not in ('member','admin','researcher') or jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception '會員設定不正確';end if;
 t:=(p->>'id')::uuid;
 select * into old from lab3_private.members where user_id=t for update;
 if not found or old.role='super_admin' or t=auth.uid() then raise exception '不可變更總管理員或自己';end if;
 update lab3_private.members set role=p->>'role',enabled=(p->>'enabled')::boolean where user_id=t;
 insert into lab3_private.audit(actor,action,details) values(auth.uid(),'member_portal_update',jsonb_build_object('id',t,'old_role',old.role,'role',p->>'role','old_enabled',old.enabled,'enabled',p->'enabled'));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function lab3_private.member_admin_portal(jsonb) from public,anon;
grant execute on function lab3_private.member_admin_portal(jsonb) to authenticated;
create or replace function public.lab3_member_admin_portal(p jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select lab3_private.member_admin_portal(p)$$;
revoke all on function public.lab3_member_admin_portal(jsonb) from public,anon;
grant execute on function public.lab3_member_admin_portal(jsonb) to authenticated;
