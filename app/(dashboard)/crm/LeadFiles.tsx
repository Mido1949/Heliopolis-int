'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, message } from 'antd';
import { FilePdfOutlined, UploadOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { listLeadFiles, openLeadFile, uploadLeadFile, type LeadFile } from '@/lib/lead-files';
import { formatDate } from '@/lib/utils';

/** Quote PDFs uploaded on a lead, with an upload button. */
export default function LeadFiles({ leadId, orgId, onCount }: { leadId: string; orgId: string | null; onCount?: (n: number) => void }) {
  const { user } = useAuth();
  const { currentOrgId, currentOrgSlug } = useOrg();
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const list = await listLeadFiles(leadId);
    setFiles(list);
    onCount?.(list.length);
  }, [leadId, onCount]);

  useEffect(() => { load(); }, [load]);

  const upload = async (picked: FileList | null) => {
    const org = orgId ?? currentOrgId;
    if (!picked?.length || !user || !org || !currentOrgSlug) return;
    setBusy(true);
    try {
      for (const f of Array.from(picked)) {
        await uploadLeadFile(f, { leadId, orgId: org, orgSlug: currentOrgSlug, userId: user.id });
      }
      message.success('اترفع على العميل');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'الرفع فشل');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input ref={input} type="file" multiple hidden accept="application/pdf,.pdf,.xls,.xlsx,.doc,.docx,image/*" onChange={(e) => upload(e.target.files)} />
      <Button block icon={<UploadOutlined />} loading={busy} onClick={() => input.current?.click()}>
        ارفع مقايسة (PDF) من جهازك
      </Button>
      {files.map((f) => (
        <button
          key={f.id}
          onClick={() => openLeadFile(f.file_path).catch((e) => message.error(e.message))}
          className="flex w-full items-center gap-3 rounded-lg border border-gray-100 p-3 text-start hover:border-accent"
        >
          <FilePdfOutlined style={{ color: '#D72B2B', fontSize: 20 }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{f.file_name}</span>
            <span className="block text-[10px] text-gray-500">
              {f.uploader?.name ?? ''} · {formatDate(f.created_at)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
