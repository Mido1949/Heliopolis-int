-- WhatsApp reply bot (2026-10-17).
--
-- The bot answers customers on the Egypt number from the CRM: instantly for a
-- new customer and at night, and for any message the team left unanswered for
-- 10 minutes. It goes quiet as soon as a rep replies. Everything here is
-- additive; the bot ships switched off (wa_bot_settings.enabled = false).

-- Bot replies are ordinary outbound rows, marked so the thread can show 🤖.
alter table public.wa_messages add column if not exists is_bot boolean not null default false;

-- Per-lead off switch (a rep's choice) and a timed snooze (set by the bot
-- itself after it hands a conversation to the team).
alter table public.leads add column if not exists bot_paused boolean not null default false;
alter table public.leads add column if not exists bot_snooze_until timestamptz;

-- One row: the global switch, and when the 10-minute sweep last ran.
create table if not exists public.wa_bot_settings (
  id            int primary key default 1 check (id = 1),
  enabled       boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  last_sweep_at timestamptz
);
insert into public.wa_bot_settings (id) values (1) on conflict (id) do nothing;

-- Every decision the bot makes, sent or not. The unique key on the customer
-- message it answers stops the webhook and the sweep from both replying.
create table if not exists public.wa_bot_runs (
  id             uuid primary key default gen_random_uuid(),
  answered_wamid text not null unique,
  lead_id        uuid references public.leads(id) on delete set null,
  customer_phone text not null,
  trigger        text not null,          -- 'inbound' | 'sweep'
  outcome        text not null,          -- 'sent' | 'blocked' | 'failed' | 'claimed'
  reply          text,
  escalated      boolean not null default false,
  reason         text,
  model          text,
  input_tokens   int,
  output_tokens  int,
  created_at     timestamptz not null default now()
);
create index if not exists wa_bot_runs_created_idx on public.wa_bot_runs (created_at desc);

-- Server-only tables: the service role bypasses RLS, nobody else reads them.
alter table public.wa_bot_settings enable row level security;
alter table public.wa_bot_runs enable row level security;

-- The 10-minute rule: every 2 minutes Supabase pokes the sweep route, which
-- answers customers nobody replied to. The route throttles itself and is safe
-- to call without a secret (see app/api/whatsapp/bot/sweep/route.ts).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('wa-bot-sweep', '*/2 * * * *', $$select net.http_post(url := 'https://loomark.vercel.app/api/whatsapp/bot/sweep', body := '{}'::jsonb, timeout_milliseconds := 55000)$$);
