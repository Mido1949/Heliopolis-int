'use client';

import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Spin, Empty } from 'antd';
import { useOrg } from '@/context/OrgContext';
import { createBrowserClient } from '@supabase/ssr';

interface OrgStats {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  brand_colors: { primary: string; secondary: string } | null;
  leadsCount: number;
  filesCount: number;
  modulesCount: number;
}

export default function SuperAdminDashboard() {
  const { allOrgs, isLoading, switchOrg, currentOrgId } = useOrg();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [orgStats, setOrgStats] = useState<OrgStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!allOrgs.length) return;
      
      setStatsLoading(true);
      const stats: OrgStats[] = [];

      for (const org of allOrgs) {
        const [
          { count: leadsCount },
          { count: filesCount },
          { count: modulesCount },
        ] = await Promise.all([
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
          supabase.from('client_files').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
          supabase.from('organization_modules').select('*', { count: 'exact', head: true }).eq('org_id', org.id).eq('enabled', true),
        ]);

        stats.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          industry: org.industry,
          brand_colors: org.brand_colors,
          leadsCount: leadsCount ?? 0,
          filesCount: filesCount ?? 0,
          modulesCount: modulesCount ?? 0,
        });
      }

      setOrgStats(stats);
      setStatsLoading(false);
    }

    loadStats();
  }, [allOrgs, supabase]);

  if (isLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" />
      </div>
    );
  }

  if (currentOrgId) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
          <p className="text-gray-500">Select an organization to manage</p>
        </div>
      </div>

      {orgStats.length === 0 ? (
        <Empty description="No organizations found" />
      ) : (
        <Row gutter={[16, 16]}>
          {orgStats.map((org) => (
            <Col xs={24} sm={12} lg={8} key={org.id}>
              <Card
                hoverable
                className="shadow-md transition-all hover:shadow-lg"
                onClick={() => switchOrg(org.id)}
                style={{ borderTop: `4px solid ${org.brand_colors?.primary || '#0D2137'}` }}
              >
                <Card.Meta
                  title={
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold">{org.name}</span>
                      <Tag color={org.brand_colors?.primary || 'blue'}>
                        {org.slug}
                      </Tag>
                    </div>
                  }
                  description={
                    <div className="mt-4 space-y-2">
                      <div className="text-sm text-gray-500">
                        Industry: {org.industry || 'N/A'}
                      </div>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Statistic
                            title="Leads"
                            value={org.leadsCount}
                            valueStyle={{ fontSize: '1.25rem' }}
                          />
                        </Col>
                        <Col span={8}>
                          <Statistic
                            title="Files"
                            value={org.filesCount}
                            valueStyle={{ fontSize: '1.25rem' }}
                          />
                        </Col>
                        <Col span={8}>
                          <Statistic
                            title="Modules"
                            value={org.modulesCount}
                            valueStyle={{ fontSize: '1.25rem' }}
                          />
                        </Col>
                      </Row>
                      <div className="text-xs text-gray-400 mt-2">
                        Click to switch to this organization
                      </div>
                    </div>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card.Grid
              className="text-center cursor-pointer hover:bg-gray-50"
              onClick={() => switchOrg(orgStats[0]?.id)}
            >
              <div className="py-4">
                <div className="text-2xl mb-2">🏢</div>
                <div>Switch to First Org</div>
              </div>
            </Card.Grid>
          </Col>
          <Col xs={24} sm={8}>
            <Card.Grid className="text-center cursor-pointer hover:bg-gray-50">
              <div className="py-4">
                <div className="text-2xl mb-2">➕</div>
                <div>Add New Organization</div>
              </div>
            </Card.Grid>
          </Col>
          <Col xs={24} sm={8}>
            <Card.Grid className="text-center cursor-pointer hover:bg-gray-50">
              <div className="py-4">
                <div className="text-2xl mb-2">⚙️</div>
                <div>Platform Settings</div>
              </div>
            </Card.Grid>
          </Col>
        </Row>
      </Card>
    </div>
  );
}