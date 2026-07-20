'use client';

import { Tabs } from 'antd';
import { useOrg } from '@/context/OrgContext';
import CompanyProfile from './CompanyProfile';
import AutomationsStatus from './AutomationsStatus';
import FilesKnowledgeBase from './FilesKnowledgeBase';

export default function HubClient() {
  const { org, isLoading, loadError, retry } = useOrg();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading hub...
      </div>
    );
  }

  if (loadError || !org) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
        <p>تعذر تحميل بيانات الشركة — Couldn&apos;t load company data.</p>
        <button
          onClick={() => retry()}
          className="px-4 py-2 rounded-lg bg-[#0D2137] text-white text-sm hover:opacity-90"
        >
          إعادة المحاولة — Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2137]">Company Hub</h1>
        <p className="text-sm text-slate-500 mt-1">{org.name} — central control panel</p>
      </div>

      <Tabs
        defaultActiveKey="profile"
        size="large"
        items={[
          { key: 'profile',     label: 'Company Profile',    children: <CompanyProfile /> },
          { key: 'automations', label: 'Automations',        children: <AutomationsStatus /> },
          { key: 'files',       label: 'Files & Knowledge',  children: <FilesKnowledgeBase /> },
        ]}
      />
    </div>
  );
}