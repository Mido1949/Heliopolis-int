'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FilePdfOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { useAuth } from '@/context/AuthContext';
import { listRecentQuoteFiles, openLeadFile, type QuoteFileRow } from '@/lib/lead-files';
import { formatDate } from '@/lib/utils';

/** Quote PDFs reps uploaded on leads. Admins see everyone's, reps their own. */
export default function UploadedQuotes() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<QuoteFileRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    listRecentQuoteFiles(isAdmin ? null : user.id).then(setRows);
  }, [user, isAdmin]);

  if (!rows?.length) return null;

  return (
    <div className="border-b">
      <div className="p-4 pb-2 font-semibold">مقايسات مرفوعة (PDF)</div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FilePdfOutlined style={{ color: '#D72B2B', fontSize: 18 }} />
            <button
              className="min-w-0 flex-1 truncate text-start font-medium hover:underline"
              onClick={() => openLeadFile(r.file_path).catch((e) => message.error(e.message))}
            >
              {r.file_name}
            </button>
            {r.lead_id && (
              <Link href={`/crm?lead=${r.lead_id}`} className="truncate text-xs text-accent hover:underline">
                {r.lead_name ?? 'العميل'}
              </Link>
            )}
            <span className="whitespace-nowrap text-xs text-gray-500">
              {r.uploader?.name ?? ''} · {formatDate(r.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
