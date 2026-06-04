'use client';

import { useEffect, useState } from 'react';
import { Badge, Spin, Tag } from 'antd';
import { useOrg } from '@/context/OrgContext';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowStatus {
  id: string;
  name: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

function statusTag(active: boolean, lastStatus: string | null) {
  if (!active) return <Tag color="default">Inactive</Tag>;
  if (lastStatus === 'error') return <Tag color="red">Error</Tag>;
  if (lastStatus === 'success') return <Tag color="green">Active</Tag>;
  return <Tag color="blue">Active</Tag>;
}

export default function AutomationsStatus() {
  const { org } = useOrg();
  const [workflows, setWorkflows] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org?.slug) return;
    setLoading(true);
    fetch(`/api/hub/automations?org_slug=${org.slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error && !data.workflows) setError(data.error);
        setWorkflows(data.workflows ?? []);
      })
      .catch(() => setError('Failed to load automations'))
      .finally(() => setLoading(false));
  }, [org?.slug]);

  if (loading) return <div className="py-12 flex justify-center"><Spin /></div>;

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-700 text-sm">
        {error === 'n8n not configured'
          ? 'n8n API is not configured. Add N8N_BASE_URL and N8N_API_KEY to environment variables.'
          : error}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400">
        <p className="text-lg font-medium">No automations found</p>
        <p className="text-sm mt-1">
          Tag your n8n workflows with <code className="bg-slate-100 px-1 rounded">{org?.slug}</code> to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workflows.map(wf => (
        <div key={wf.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge status={wf.active ? (wf.lastStatus === 'error' ? 'error' : 'processing') : 'default'} />
            <div>
              <p className="font-semibold text-[#0D2137] text-sm">{wf.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Last run:{' '}
                {wf.lastRunAt
                  ? formatDistanceToNow(new Date(wf.lastRunAt), { addSuffix: true })
                  : 'Never'}
              </p>
            </div>
          </div>
          <div>{statusTag(wf.active, wf.lastStatus)}</div>
        </div>
      ))}
    </div>
  );
}