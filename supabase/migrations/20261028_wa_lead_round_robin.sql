-- Owner for a new Egypt WhatsApp lead: the active tech sales engineer who was
-- given the fewest leads in the last 7 days. "Active" = signed in within 14 days,
-- so a rep who left (or is on leave) stops receiving chats without a config change.
-- Called by app/api/whatsapp/webhook/route.ts when it creates a lead.
create or replace function public.pick_wa_lead_owner()
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select p.id
  from profiles p
  join auth.users u on u.id = p.id
  left join leads l
    on l.assigned_to_user = p.id
   and l.created_at > now() - interval '7 days'
  where p.role = 'Sales Engineer'
    and p.crm_team = 'tech'
    and p.country = 'EG'
    and u.last_sign_in_at > now() - interval '14 days'
  group by p.id
  order by count(l.id), random()
  limit 1
$$;

revoke all on function public.pick_wa_lead_owner() from public, anon, authenticated;
grant execute on function public.pick_wa_lead_owner() to service_role;
