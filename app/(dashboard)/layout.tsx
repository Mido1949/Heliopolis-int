import { Shell } from '@/components/layout';
import { OrgProvider } from '@/context/OrgContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProvider>
      <Shell>{children}</Shell>
    </OrgProvider>
  );
}
