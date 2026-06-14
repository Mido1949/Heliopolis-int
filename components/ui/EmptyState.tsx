"use client"

import { Empty } from "antd"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div dir="auto" className="flex flex-col items-center justify-center py-10">
      {icon}
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={null}
      />
      <p className="font-semibold text-base">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
