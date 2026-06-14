import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const MAX_FILE_CHARS = 50_000;
const KB_HEADER = '\n\n---\n## معلومات الشركة (Company Knowledge Base)\n';
const DB_HEADER = '\n\n---\n## معلومات الشركة (Live Knowledge Base)\n';

/**
 * Live, DB-backed knowledge for Helio. Reads active rows from `knowledge_base`
 * (editable any time, no redeploy) and appends the file-based knowledge as a
 * supplement. This is the preferred feed because the serverless runtime can't
 * always read repo files (`system-approval/`) on Vercel.
 */
export async function loadHelioKnowledge(orgId?: string): Promise<string> {
  let dbPart = '';
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    let query = supabase
      .from('knowledge_base')
      .select('title, content, content_type')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (orgId) query = query.eq('org_id', orgId);
    const { data } = await query;
    if (data && data.length) {
      dbPart = DB_HEADER + data
        .map((k: { title: string; content: string }) => {
          const c = k.content.length > MAX_FILE_CHARS ? k.content.slice(0, MAX_FILE_CHARS) + '\n[...]' : k.content;
          return `### ${k.title}\n${c}`;
        })
        .join('\n\n---\n');
    }
  } catch (err) {
    console.error('[helio-knowledge] DB load failed:', err);
  }

  // File-based knowledge as a supplement/fallback.
  const filePart = loadSystemApprovalContext();
  return dbPart + filePart;
}

/**
 * T017: Load all .md files in /system-approval (excluding README.md)
 * and concatenate them into a single string suitable for prepending
 * to the Helio AI system prompt.
 *
 * - Returns '' if the directory is missing or contains no .md files
 * - Truncates each file to MAX_FILE_CHARS characters
 */
export function loadSystemApprovalContext(): string {
  const dir = path.join(process.cwd(), 'system-approval');

  if (!fs.existsSync(dir)) return '';

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return '';
  }

  const mdFiles = entries.filter(f => f.endsWith('.md') && f !== 'README.md');
  if (mdFiles.length === 0) return '';

  const parts = mdFiles.map(f => {
    const filePath = path.join(dir, f);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return `### ${f}\n[unreadable]`;
    }

    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + '\n[... truncated]';
    }

    return `### ${f}\n${content}`;
  });

  return KB_HEADER + parts.join('\n\n---\n');
}
