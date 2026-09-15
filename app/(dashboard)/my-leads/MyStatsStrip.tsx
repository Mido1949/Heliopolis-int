'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Target, Users, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { ACTIVE_PIPELINE_STAGES, slaColor } from '@/lib/constants';
import { withTimeout } from '@/lib/utils';
import StatCard from '@/components/dashboard/StatCard';

interface StatLead {
  id: string;
  pipeline_stage: string | null;
  deal_value: number | null;
  created_at: string;
  next_follow_up: string | null;
  stage_timestamps: Record<string, string> | null;
}

interface Stats {
  active: number;
  activeTrend: number[];
  activeDelta: number | null;
  needsAction: number;
  pipelineValue: number;
  target: number | null;
  actual: number;
  progress: number;
}

// BOQ totals and deal values are entered in EGP across this app.
const egp = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The four headline numbers for one rep's own book of work, above their lead
 * table. Fetches independently of the table so filtering the table never
 * changes the totals.
 */
export default function MyStatsStrip({ reloadToken = 0 }: { reloadToken?: number }) {
  const { user } = useAuth();
  const { currentOrgId } = useOrg();
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const todayISO = now.toISOString().slice(0, 10);

    try {
      const [leadsRes, targetRes] = await withTimeout(
        Promise.all([
          supabase
            .from('leads')
            .select('id, pipeline_stage, deal_value, created_at, next_follow_up, stage_timestamps')
            .eq('assigned_to_user', user.id)
            .limit(1000),
          supabase
            .from('sales_targets')
            .select('target_value')
            .eq('user_id', user.id)
            .eq('target_type', 'leads')
            .lte('period_start', todayISO)
            .gte('period_end', todayISO)
            .limit(1),
        ]),
        15000,
        'My stats fetch',
      );

      const leads = (leadsRes.data || []) as StatLead[];

      const activeLeads = leads.filter(l =>
        (ACTIVE_PIPELINE_STAGES as readonly string[]).includes(l.pipeline_stage || 'NEW'),
      );

      // Needs action = SLA has gone red, or a follow-up is due today or earlier.
      const needsAction = activeLeads.filter(
        l => slaColor(l) === 'red' || (l.next_follow_up && l.next_follow_up.slice(0, 10) <= todayISO),
      ).length;

      const pipelineValue = activeLeads.reduce((sum, l) => sum + Number(l.deal_value || 0), 0);

      // Last 7 days of intake, oldest → newest, for the sparkline.
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      for (const l of leads) {
        const k = dayKey(l.created_at);
        if (k in buckets) buckets[k] += 1;
      }
      const activeTrend = Object.values(buckets);

      const thisMonth = leads.filter(l => new Date(l.created_at) >= monthStart).length;
      const lastMonth = leads.filter(l => {
        const d = new Date(l.created_at);
        return d >= prevMonthStart && d < monthStart;
      }).length;
      const activeDelta =
        lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

      const target = targetRes.data?.[0]?.target_value
        ? Number(targetRes.data[0].target_value)
        : null;

      setStats({
        active: activeLeads.length,
        activeTrend,
        activeDelta,
        needsAction,
        pipelineValue,
        target,
        actual: thisMonth,
        progress: target && target > 0 ? Math.round((thisMonth / target) * 100) : 0,
      });
    } catch (err) {
      console.error('MyStatsStrip fetch error:', err);
      setStats(null);
    }
  }, [user]);

  useEffect(() => {
    void load();
    // currentOrgId is a dependency so the strip refetches after an org switch.
  }, [load, reloadToken, currentOrgId]);

  if (!stats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-[178px] animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        tone="violet"
        icon={<Users className="h-5 w-5" />}
        label="عملائي النشطين"
        value={String(stats.active)}
        deltaPercent={stats.activeDelta}
        deltaCaption="عن الشهر اللي فات"
        trend={stats.activeTrend}
      />
      <StatCard
        tone="amber"
        icon={<AlertCircle className="h-5 w-5" />}
        label="محتاج إجراء دلوقتي"
        value={String(stats.needsAction)}
        progress={stats.active > 0 ? Math.round((stats.needsAction / stats.active) * 100) : 0}
        progressCaption={`من إجمالي ${stats.active} عميل`}
      />
      <StatCard
        tone="blue"
        icon={<Wallet className="h-5 w-5" />}
        label="قيمة خط الأنابيب"
        value={egp.format(stats.pipelineValue)}
        progressCaption=""
        trend={stats.activeTrend}
      />
      <StatCard
        tone="green"
        icon={<Target className="h-5 w-5" />}
        label="هدف الشهر"
        value={stats.target ? `${stats.progress}%` : '—'}
        progress={stats.target ? stats.progress : 0}
        progressCaption={
          stats.target
            ? `${stats.actual} من ${stats.target} عميل`
            : 'لم يتم تحديد هدف شهري'
        }
      />
    </div>
  );
}
