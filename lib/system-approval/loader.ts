import fs from 'fs';
import path from 'path';

const MAX_FILE_CHARS = 50_000;
const KB_HEADER = '\n\n---\n## معلومات الشركة (Company Knowledge Base)\n';

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
