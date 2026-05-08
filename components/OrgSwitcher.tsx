'use client';

import { Select, Space, Typography } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { useOrg } from '@/context/OrgContext';

const { Text } = Typography;

export default function OrgSwitcher() {
  const { isSuperAdmin, allOrgs, currentOrgId, currentOrgName, switchOrg, isLoading } = useOrg();

  if (!isSuperAdmin || isLoading || allOrgs.length === 0) {
    return null;
  }

  return (
    <Space direction="vertical" size={0} className="w-48">
      <Space align="center" size={4}>
        <SwapOutlined className="text-blue-500" />
        <Text type="secondary" className="text-xs uppercase tracking-wide">
          Organization
        </Text>
      </Space>
      <Select
        value={currentOrgId}
        onChange={(value) => switchOrg(value)}
        className="w-full"
        placeholder="Select organization"
        options={allOrgs.map((org) => ({
          value: org.id,
          label: org.name,
        }))}
      />
      {currentOrgName && (
        <Text type="secondary" className="text-xs">
          Viewing: {currentOrgName}
        </Text>
      )}
    </Space>
  );
}