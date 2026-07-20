'use client';

import { Card, Statistic, Row, Col } from 'antd';
import { useOrg } from '@/context/OrgContext';

type Props = { leadsByStatus: Record<string, number> };

export default function AnalyticsClient({ leadsByStatus }: Props) {
  const { org } = useOrg();
  const total = Object.values(leadsByStatus).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics — {org?.name}</h1>
      <Row gutter={16}>
        <Col span={6}>
          <Card><Statistic title="Total Leads" value={total} /></Card>
        </Col>
        {Object.entries(leadsByStatus).map(([status, count]) => (
          <Col span={6} key={status}>
            <Card><Statistic title={status} value={count} /></Card>
          </Col>
        ))}
      </Row>
      <Card title="المزيد قريباً — More analytics coming soon">
        تقارير الإيرادات والتحويل التفصيلية متاحة في صفحة التقارير — Detailed revenue and
        conversion reporting is available on the Reports page.
      </Card>
    </div>
  );
}