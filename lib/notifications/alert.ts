import { sendTelegramMessage } from './telegram';

export async function sendOpsAlert(message: string): Promise<void> {
  try {
    const result = await sendTelegramMessage(`🚨 HelioMax Ops: ${message}`);
    if (!result.ok) {
      console.error('[sendOpsAlert] Telegram failed:', result.error);
    }
  } catch (err) {
    console.error('[sendOpsAlert] Unexpected error:', err);
  }
}
