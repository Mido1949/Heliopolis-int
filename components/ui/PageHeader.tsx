"use client"

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  icon?: React.ReactNode
}

function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div>{actions}</div>}
    </div>
  )
}

export default PageHeader
