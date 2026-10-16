-- Who sent a CRM reply. Null for customer messages, phone/WhatsApp Web echoes
-- and history: only /api/whatsapp/send knows the signed-in rep.
alter table public.wa_messages
  add column if not exists sent_by uuid references public.profiles(id) on delete set null;
