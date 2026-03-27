'use client';

import { Skeleton, Space } from 'antd';

interface LoadingSkeletonProps {
  type?: 'cards' | 'table' | 'form' | 'detail';
  count?: number;
}

export default function LoadingSkeleton({ type = 'cards', count = 4 }: LoadingSkeletonProps) {
  if (type === 'cards') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5">
            <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="bg-white rounded-xl p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className="bg-white rounded-xl p-6 max-w-2xl">
        <Space direction="vertical" size="large" className="w-full">
          <Skeleton.Input active size="large" block />
          <Skeleton.Input active size="large" block />
          <Skeleton.Input active size="large" block />
          <Skeleton.Button active size="large" style={{ width: 120 }} />
        </Space>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6">
      <Skeleton active avatar paragraph={{ rows: 4 }} />
    </div>
  );
}
