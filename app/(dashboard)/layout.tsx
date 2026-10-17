import { Shell } from '@/components/layout';
import { OrgProvider } from '@/context/OrgContext';
import ErrorReporter from '@/components/layout/ErrorReporter';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProvider>
      <ErrorReporter />
      <Shell>{children}</Shell>
    </OrgProvider>
  );
}
