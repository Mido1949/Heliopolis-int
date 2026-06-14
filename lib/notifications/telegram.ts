/**
 * T066: Telegram Bot API wrapper.
 * Sends a message to the configured chat via fetch.
 */
export async function sendTelegramMessage(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const post = async (body: Record<string, unknown>): Promise<{ ok: boolean; error: string }> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.ok, error: data.description || `HTTP ${res.status}` };
  };

  try {
    // Try Markdown first (nice formatting for short ops messages).
    let r = await post({ chat_id: chatId, text, parse_mode: 'Markdown' });
    // Long report bodies (Arabic AI text, $ amounts, names) often break Telegram's
    // Markdown parser — fall back to plain text so the message still arrives.
    if (!r.ok) {
      r = await post({ chat_id: chatId, text });
    }
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
