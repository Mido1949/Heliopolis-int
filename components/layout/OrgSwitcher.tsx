'use client';

import { Select } from 'antd';
import { useOrg } from '@/context/OrgContext';
import { useRouter } from 'next/navigation';

export default function OrgSwitcher() {
  const { isSuperAdmin, allOrgs, currentOrgId, switchOrg, isLoading } = useOrg();
  const router = useRouter();

  if (!isSuperAdmin || allOrgs.length === 0) return null;

  const handleChange = async (orgId: string) => {
    await switchOrg(orgId);
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <Select
      value={currentOrgId ?? undefined}
      onChange={handleChange}
      loading={isLoading}
      size="small"
      style={{ minWidth: 160 }}
      optionLabelProp="label"
    >
      {allOrgs.map((org) => {
        const color = org.brand_colors?.primary ?? '#0D2137';
        return (
          <Select.Option key={org.id} value={org.id} label={
            <span className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
              <span className="font-medium">{org.name}</span>
            </span>
          }>
            <span className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
              <span>{org.name}</span>
              <span className="text-slate-400 text-xs ml-auto">{org.industry}</span>
            </span>
          </Select.Option>
        );
      })}
    </Select>
  );
}
