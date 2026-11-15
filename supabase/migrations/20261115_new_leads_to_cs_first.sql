-- Every new inbound Egypt lead goes to the CS team first (Reem, Mona) — 2026-11-15.
-- Mido: "all leads landing on the crm goes to reem and mona first of all". CS qualifies
-- the lead, then transfers it to a tech sales engineer (app/api/leads/[id]/transfer).
-- Pick = the active CS rep given the fewest leads in the last 7 days. If no CS rep has
-- signed in for 14 days (both on leave), fall back to the old tech round robin so a
-- chat is never left ownerless.
create or replace function public.pick_new_lead_owner()
returns table (user_id uuid, team text)
language sql
security definer
set search_path = public, auth
as $$
  with candidates as (
    select p.id, p.crm_team,
           case p.crm_team when 'cs' then 0 else 1 end as tier,
           count(l.id) as recent
    from profiles p
    join auth.users u on u.id = p.id
    left join leads l
      on l.assigned_to_user = p.id
     and l.created_at > now() - interval '7 days'
    where p.role = 'Sales Engineer'
      and p.crm_team in ('cs', 'tech')
      and p.country = 'EG'
      and u.last_sign_in_at > now() - interval '14 days'
    group by p.id, p.crm_team
  )
  select id, crm_team
  from candidates
  order by tier, recent, random()
  limit 1
$$;

revoke all on function public.pick_new_lead_owner() from public, anon, authenticated;
grant execute on function public.pick_new_lead_owner() to service_role;
