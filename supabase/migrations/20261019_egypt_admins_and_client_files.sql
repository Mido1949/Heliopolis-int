-- 2026-10-19 — applied directly to production via the SQL editor / MCP.

-- 1. Admin no longer implies Saudi visibility: only platform admins see every
--    country, so the Egypt team can all be admins without seeing Saudi data.
create or replace function public.current_user_sees_all_countries()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
$function$;

-- 2. Every Egypt user works as admin (Mido, 2026-10-19). Previous roles:
--    habiba/alaa/omnya/nahla = Sales Engineer, ragaa = Tech Team Leader,
--    mona/menna/Reem = Call Center, esraa = Telesales.
update public.profiles set role = 'admin', updated_at = now()
 where country = 'EG' and role <> 'admin' and org_id = '3f3fa998-aea4-4b38-b701-2c4b1e8253a1';
update public.organization_members om set role = 'admin'
 from public.profiles p where p.id = om.user_id and p.country = 'EG' and om.role = 'member';

-- 3. The File Manager uploaded to a bucket that never existed.
insert into storage.buckets (id, name, public) values ('client-files', 'client-files', false)
on conflict (id) do nothing;

create policy client_files_org_rw on storage.objects for all to authenticated
using (
  bucket_id = 'client-files'
  and (storage.foldername(name))[1] in (
    select o.slug from public.organizations o
    join public.organization_members m on m.org_id = o.id
    where m.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'client-files'
  and (storage.foldername(name))[1] in (
    select o.slug from public.organizations o
    join public.organization_members m on m.org_id = o.id
    where m.user_id = auth.uid()
  )
);
