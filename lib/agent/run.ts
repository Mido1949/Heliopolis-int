import Anthropic from '@anthropic-ai/sdk';
import { toolsForRole, executeTool, type ToolContext } from './tools';

/**
 * Run one Helio turn through the Anthropic tool-use loop and return the final
 * text. Shared by server-initiated callers (e.g. the Telegram webhook) that
 * don't have the browser chat's request shape. Tools are role-filtered and
 * executed via the provided ToolContext.
 */
export async function runHelioConversation(
  userText: string,
  ctx: ToolContext,
  system: string,
  maxIterations = 6
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'هيليو مش متاح دلوقتي (مفيش مفتاح Anthropic).';
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const toolDefs = toolsForRole(ctx.callerRole).map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));

  const convo: Anthropic.MessageParam[] = [{ role: 'user', content: userText }];
  let finalText = '';

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      tools: toolDefs,
      messages: convo,
    });

    const textParts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text);
    if (textParts.length) finalText = textParts.join('\n').trim();

    if (response.stop_reason !== 'tool_use') break;

    convo.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')) {
      let resultText: string;
      let isError = false;
      try {
        resultText = await executeTool(tu.name, (tu.input as Record<string, unknown>) || {}, ctx);
      } catch (err) {
        isError = true;
        resultText = (err as { message?: string })?.message || 'خطأ في تنفيذ الأداة.';
      }
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: resultText, is_error: isError });
    }
    convo.push({ role: 'user', content: toolResults });
  }

  return finalText || 'تمام ✅';
}
