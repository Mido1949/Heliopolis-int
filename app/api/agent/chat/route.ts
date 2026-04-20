import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const FALLBACKS = [
  'أهلاً! أنا لوك، مساعدك في LOOMARK. اضغط عليّا لو عندك أي سؤال! 👋',
  'يلا نشتغل! إيه اللي محتاج تعمله النهاردة؟ 💪',
  'هنا لو احتجتني! بس API key محتاج يتضاف في Vercel. 🔧',
];

export async function POST(request: Request) {
  try {
    const { messages, system } = await request.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        content: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)],
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system,
      messages,
    });

    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : 'عذراً، مش فاهم!';

    return NextResponse.json({ content });
  } catch (err) {
    console.error('[look-agent]', err);
    return NextResponse.json({ content: 'عندي مشكلة في الاتصال دلوقتي! 😅' });
  }
}
