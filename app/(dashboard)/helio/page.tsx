'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import {
  Card, Switch, InputNumber, Button, Tag, Empty, Spin, message, Tooltip, Segmented,
} from 'antd';
import {
  Brain, RotateCcw, Pause, Play, AlertTriangle, Clock, UserPlus, Scale,
  Bell, CalendarClock, FileText, Search, ListChecks,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arEG } from 'date-fns/locale';

interface AgentAction {
  id: string;
  action_type: string;
  origin: 'chat' | 'autonomous';
  reasoning: string;
  created_at: string;
  undone_at: string | null;
}

interface AgentSettings {
  autonomy_paused: boolean;
  stuck_threshold_days: number;
  nudge_suppression_hours: number;
}

const REVERSIBLE = new Set(['assign_lead', 'rebalance', 'create_task', 'schedule_followup']);

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  assign_lead:       { label: 'تعيين ليد',     icon: <UserPlus size={15} />,     color: 'blue' },
  rebalance:         { label: 'موازنة حمل',     icon: <Scale size={15} />,        color: 'geekblue' },
  create_task:       { label: 'إنشاء مهمة',     icon: <ListChecks size={15} />,   color: 'cyan' },
  schedule_followup: { label: 'جدولة متابعة',   icon: <CalendarClock size={15} />, color: 'purple' },
  nudge:             { label: 'تذكير',          icon: <Bell size={15} />,         color: 'gold' },
  escalate:          { label: 'تصعيد',          icon: <AlertTriangle size={15} />, color: 'red' },
  generate_report:   { label: 'تقرير',          icon: <FileText size={15} />,     color: 'green' },
  queue_scrape:      { label: 'سحب ليدات',      icon: <Search size={15} />,       color: 'magenta' },
};

export default function HelioControlPage() {
  const { isAdmin, isTeamLeader } = useAuth();
  const supabase = createClient();

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'autonomous' | 'chat'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [actionsRes, settingsRes] = await Promise.all([
      supabase
        .from('agent_actions')
        .select('id, action_type, origin, reasoning, created_at, undone_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('agent_settings')
        .select('autonomy_paused, stuck_threshold_days, nudge_suppression_hours')
        .eq('id', 1)
        .single(),
    ]);
    if (actionsRes.data) setActions(actionsRes.data as AgentAction[]);
    if (settingsRes.data) setSettings(settingsRes.data as AgentSettings);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (patch: Partial<AgentSettings>) => {
    if (!settings) return;
    setSavingSettings(true);
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase
      .from('agent_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) {
      message.error('فشل حفظ الإعدادات: ' + error.message);
      load();
    } else {
      message.success('تم الحفظ');
    }
    setSavingSettings(false);
  };

  const undo = async (id: string) => {
    setUndoing(id);
    try {
      const res = await fetch(`/api/agent/actions/${id}/undo`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        message.success('تم التراجع عن الإجراء');
        setActions(prev => prev.map(a => a.id === id ? { ...a, undone_at: new Date().toISOString() } : a));
      } else {
        const reasonMsg: Record<string, string> = {
          already_undone: 'تم التراجع عنه مسبقاً',
          not_reversible: 'هذا الإجراء لا يمكن التراجع عنه',
          state_changed: 'تغيّرت الحالة منذ تنفيذ الإجراء — لا يمكن التراجع بأمان',
        };
        message.warning(reasonMsg[data.reason] || data.error || 'فشل التراجع');
      }
    } catch {
      message.error('خطأ في الاتصال');
    } finally {
      setUndoing(null);
    }
  };

  if (!isAdmin && !isTeamLeader) {
    return (
      <div dir="rtl" className="p-8">
        <Empty description="هذه الصفحة متاحة للمديرين ومشرفي الفرق فقط." />
      </div>
    );
  }

  const filtered = actions.filter(a => filter === 'all' || a.origin === filter);

  return (
    <div dir="rtl" className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-sm">
          <Brain size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0">مركز تحكّم هيليو</h1>
          <p className="text-sm text-slate-500 m-0">سجل إجراءات هيليو وإعدادات التحكم الذاتي</p>
        </div>
      </div>

      {/* Settings */}
      <Card className="rounded-2xl shadow-sm" styles={{ body: { padding: 18 } }}>
        {!settings ? (
          <Spin />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {settings.autonomy_paused
                  ? <Pause size={18} className="text-red-500" />
                  : <Play size={18} className="text-green-500" />}
                <div>
                  <div className="text-sm font-semibold text-slate-800">التحكم الذاتي</div>
                  <div className="text-xs text-slate-500">
                    {settings.autonomy_paused ? 'متوقف' : 'نشِط — هيليو يتصرّف تلقائياً'}
                  </div>
                </div>
              </div>
              <Switch
                checked={!settings.autonomy_paused}
                disabled={!isAdmin || savingSettings}
                onChange={(on) => saveSettings({ autonomy_paused: !on })}
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800 mb-1">حد الليد الواقف (أيام)</div>
              <InputNumber
                min={1} max={30}
                value={settings.stuck_threshold_days}
                disabled={!isAdmin || savingSettings}
                onChange={(v) => v && saveSettings({ stuck_threshold_days: v })}
                className="w-full"
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800 mb-1">منع تكرار التذكير (ساعات)</div>
              <InputNumber
                min={1} max={168}
                value={settings.nudge_suppression_hours}
                disabled={!isAdmin || savingSettings}
                onChange={(v) => v && saveSettings({ nudge_suppression_hours: v })}
                className="w-full"
              />
            </div>
          </div>
        )}
        {!isAdmin && (
          <div className="text-xs text-slate-400 mt-3">الإعدادات للقراءة فقط (تعديلها للمدير).</div>
        )}
      </Card>

      {/* Timeline */}
      <Card
        className="rounded-2xl shadow-sm"
        styles={{ body: { padding: 0 } }}
        title={
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">سجل الإجراءات</span>
            <Segmented
              size="small"
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              options={[
                { label: 'الكل', value: 'all' },
                { label: 'تلقائي', value: 'autonomous' },
                { label: 'محادثة', value: 'chat' },
              ]}
            />
          </div>
        }
      >
        {loading ? (
          <div className="p-10 flex justify-center"><Spin /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10">
            <Empty description="لا توجد إجراءات بعد" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((a) => {
              const meta = ACTION_META[a.action_type] || { label: a.action_type, icon: <Brain size={15} />, color: 'default' };
              const canUndo = REVERSIBLE.has(a.action_type) && !a.undone_at;
              return (
                <li key={a.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50/60">
                  <Tag color={meta.color} className="flex items-center gap-1 m-0 mt-0.5">
                    {meta.icon}<span>{meta.label}</span>
                  </Tag>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm leading-relaxed ${a.undone_at ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {a.reasoning}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock size={11} />
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: arEG })}
                      </span>
                      {a.origin === 'autonomous'
                        ? <Tag color="orange" className="text-[10px] m-0">تلقائي</Tag>
                        : <Tag className="text-[10px] m-0">محادثة</Tag>}
                      {a.undone_at && <Tag color="default" className="text-[10px] m-0">تم التراجع</Tag>}
                    </div>
                  </div>
                  {canUndo && (
                    <Tooltip title="تراجع">
                      <Button
                        size="small"
                        icon={<RotateCcw size={14} />}
                        loading={undoing === a.id}
                        onClick={() => undo(a.id)}
                      >
                        تراجع
                      </Button>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
