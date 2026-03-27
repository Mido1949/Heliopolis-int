'use client';

import { Card, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

interface KPICardProps {
  title: string;
  value: number | string;
  suffix?: string;
  prefix?: React.ReactNode;
  trend?: number; // positive = up, negative = down
  icon?: React.ReactNode;
  loading?: boolean;
}

export default function KPICard({
  title,
  value,
  suffix,
  prefix,
  trend,
  icon,
  loading = false,
}: KPICardProps) {
  const trendColor =
    trend && trend > 0 ? '#52c41a' : trend && trend < 0 ? '#f5222d' : '#8c8c8c';
  const TrendIcon =
    trend && trend > 0 ? ArrowUpOutlined : trend && trend < 0 ? ArrowDownOutlined : null;

  return (
    <Card
      loading={loading}
      className="kpi-card hover:shadow-md transition-shadow duration-200"
      style={{ borderRadius: 12 }}
      bodyStyle={{ padding: '20px 24px' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-500 text-sm mb-2">{title}</p>
          <Statistic
            value={value}
            suffix={suffix}
            prefix={prefix}
            valueStyle={{ fontSize: 28, fontWeight: 700, color: '#0D2137' }}
          />
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {TrendIcon && <TrendIcon style={{ color: trendColor, fontSize: 12 }} />}
              <span style={{ color: trendColor, fontSize: 13, fontWeight: 500 }}>
                {Math.abs(trend)}%
              </span>
              <span className="text-gray-400 text-xs">vs last month</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-lg"
            style={{ backgroundColor: 'rgba(215, 43, 43, 0.08)', color: '#D72B2B' }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
