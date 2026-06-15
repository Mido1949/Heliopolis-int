import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runHelioConversation } from '@/lib/agent/run';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import type { ToolContext } from '@/lib/agent/tools';

export const dynamic = 'force-dynamic';

/**
 * Inbound Telegram bot webhook — lets Mido command Helio from Telegram
 * (e.g. "اعمل تاسك لمحمد: اتصل بالعميل بكرة", "كام ليد واقف؟").
 *
 * Security: Telegram sends the configured secret in the
 * X-Telegram-Bot-Api-Secret-Token header (set when registering the webhook);
 * we also restrict to the configured TELEGRAM_CHAT_ID so only the owner's chat
 * is honored. The message is run through Helio's admin tool-use loop and the
 * reply is sent back to the same chat.
 */
export async function POST(request: NextRequest) {
  // Verify Telegram secret token (fail-closed). Always 200 so Telegram doesn't retry.
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: true, ignored: 'bad_secret' });
  }

  let update: { message?: { text?: string; chat?: { id?: number } } };
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: 'bad_json' });
  }

  const text = update.message?.text?.trim();
  const chatId = String(update.message?.chat?.id ?? '');

  // Only respond to the configured owner chat.
  if (!chatId || chatId !== process.env.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: true, ignored: 'unauthorized_chat' });
  }
  if (!text) {
    return NextResponse.json({ ok: true, ignored: 'no_text' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Act as the admin (Mido) — resolve the admin profile.
    const { data: admin } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('role', 'admin')
      .limit(1)
      .single();
    if (!admin) {
      await sendTelegramMessage('⚠️ مفيش حساب admin متسجّل في النظام.');
      return NextResponse.json({ ok: true });
    }

    const ctx: ToolContext = {
      callerClient: supabase, // service role = admin-level access for the owner
      serviceClient: supabase,
      callerId: admin.id,
      callerRole: 'admin',
      origin: 'chat',
    };

    const system =
      'أنت هيليو، المساعد الذكي لـ HelioMax، بترد على المالك (Mido) عبر تليجرام. ' +
      'رد مختصر وعملي بالعربي المصري. لو طلب إجراء (تاسك/تعيين/تذكير/تقرير) نفّذه بالأدوات وأكّد بنتيجة واضحة.';

    const reply = await runHelioConversation(text, ctx, system);
    await sendTelegramMessage(reply);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telegram-webhook] failed:', err);
    await sendTelegramMessage('😅 حصل خطأ وأنا بنفّذ طلبك، جرّب تاني.').catch(() => {});
    return NextResponse.json({ ok: true });
  }
}
