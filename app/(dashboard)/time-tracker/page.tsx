'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Table, Button, Typography, Row, Col, message, Card, Statistic,
  Select, Tag, Input, Avatar, Progress, Tooltip,
} from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ClockCircleOutlined,
  TrophyOutlined, CalendarOutlined, UserOutlined,
  FireOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { TASK_TYPES } from '@/lib/constants';
import { formatDuration } from '@/lib/utils';

const { Title, Text } = Typography;

interface TimeLog {
  id: string;
  task_type: string;
  description: string | null;
  lead_id: string | null;
  duration_seconds: number;
  started_at: string;
  ended_at: string | null;
  user_id: string;
}

interface LeadOption {
  id: string;
  name: string;
  company?: string;
}

interface TeamMember {
  id: string;
  name: string;
  avatar_url?: string;
  score: number;
  totalSeconds: number;
  taskCount: number;
}

export default function TimeTrackerPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  // Real-time clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Timer state
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [taskType, setTaskType] = useState('BOQ');
  const [taskDesc, setTaskDesc] = useState('');
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  // Real-time clock — updates every second
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Timer tick — uses real time elapsed, not increments
  useEffect(() => {
    if (isRunning && startTimeRef.current) {
      intervalRef.current = setInterval(() => {
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - startTimeRef.current!.getTime()) / 1000);
        setElapsed(diffSeconds);
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  // Resume timer from localStorage
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('loomark_timer_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        const savedStartTime = new Date(parsed.startTime);
        
        // Calculate elapsed so far
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - savedStartTime.getTime()) / 1000);
        
        setTaskType(parsed.taskType);
        setTaskDesc(parsed.taskDesc);
        setSelectedLead(parsed.selectedLead);
        setActiveLogId(parsed.activeLogId);
        
        startTimeRef.current = savedStartTime;
        setElapsed(diffSeconds);
        setIsRunning(true);
      }
    } catch (e) {
      console.error('Failed to load timer state:', e);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    // Today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);
    if (error) message.error('Failed to load time logs');
    else setLogs((data || []) as TimeLog[]);
    setLoading(false);
  }, [supabase]);

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase.from('leads').select('id, name, company').order('name');
    if (data) setLeads(data as LeadOption[]);
  }, [supabase]);

  const fetchTeam = useCallback(async () => {
    // Fetch profiles with scores
    const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url, score');
    if (!profiles) return;

    // Fetch this week's time logs for all users
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekLogs } = await supabase
      .from('time_logs')
      .select('user_id, duration_seconds')
      .gte('started_at', weekAgo);

    const teamData: TeamMember[] = profiles.map(p => {
      const userLogs = (weekLogs || []).filter(l => l.user_id === p.id);
      return {
        id: p.id,
        name: p.name,
        avatar_url: p.avatar_url,
        score: p.score || 0,
        totalSeconds: userLogs.reduce((s, l) => s + (l.duration_seconds || 0), 0),
        taskCount: userLogs.length,
      };
    });
    // Sort by score desc
    teamData.sort((a, b) => b.score - a.score);
    setTeam(teamData);
  }, [supabase]);

  useEffect(() => {
    fetchLogs();
    fetchLeads();
    fetchTeam();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startTimer = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { message.error('Please log in first'); return; }

    const now = new Date();
    const { data, error } = await supabase.from('time_logs').insert({
      user_id: user.id,
      task_type: taskType,
      description: taskDesc || null,
      lead_id: selectedLead || null,
      started_at: now.toISOString(),
      duration_seconds: 0,
    }).select().single();

    if (error) { message.error('Failed to start timer'); return; }
    setActiveLogId(data.id);
    startTimeRef.current = now;
    setElapsed(0);
    setIsRunning(true);
    message.success('Timer started ⏱️');

    // Save active state to keep tracking in background
    localStorage.setItem('loomark_timer_state', JSON.stringify({
      startTime: now.toISOString(),
      taskType: taskType,
      taskDesc: taskDesc,
      selectedLead: selectedLead,
      activeLogId: data.id
    }));
  };

  const stopTimer = async () => {
    if (!activeLogId) return;
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    const { error } = await supabase.from('time_logs').update({
      duration_seconds: elapsed,
      ended_at: new Date().toISOString(),
    }).eq('id', activeLogId);

    if (error) message.error('Failed to save time');
    else {
      message.success(`Logged ${formatDuration(elapsed)}`);
      localStorage.removeItem('loomark_timer_state');
    }

    setActiveLogId(null);
    setElapsed(0);
    startTimeRef.current = null;
    setTaskDesc('');
    setSelectedLead(null);
    fetchLogs();
    fetchTeam();
  };

  // ── Computed Data ──
  const today = new Date();
  const todayLogs = logs.filter(l => new Date(l.started_at).toDateString() === today.toDateString());
  const todayTotal = todayLogs.reduce((s, l) => s + l.duration_seconds, 0);

  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekLogs = logs.filter(l => new Date(l.started_at) >= weekAgo);
  const weekTotal = weekLogs.reduce((s, l) => s + l.duration_seconds, 0);

  // Weekly summary — group by day
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
  const weeklyData = weekDays.map(d => {
    const dayLogs = logs.filter(l => new Date(l.started_at).toDateString() === d.toDateString());
    const totalHrs = dayLogs.reduce((s, l) => s + l.duration_seconds, 0) / 3600;
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      hours: totalHrs,
      tasks: dayLogs.length,
    };
  });

  // Timer display
  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const timerDisplay = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  // Real clock display
  const clockDisplay = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateDisplay = currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Lead name lookup
  const getLeadName = (leadId: string | null) => {
    if (!leadId) return '—';
    const lead = leads.find(l => l.id === leadId);
    return lead ? lead.name : leadId.substring(0, 8);
  };

  // ── Table Columns ──
  const columns: ColumnsType<TimeLog> = [
    {
      title: 'Type', dataIndex: 'task_type', key: 'task_type', width: 120,
      render: (t: string) => {
        const cfg = TASK_TYPES.find(x => x.value === t);
        const colors: Record<string, string> = { BOQ: 'blue', Call: 'green', Meeting: 'purple', Email: 'cyan', Admin: 'orange', Other: 'default' };
        return <Tag color={colors[t] || 'default'}>{cfg?.labelAr || t}</Tag>;
      },
    },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (d: string | null) => d || '—' },
    {
      title: 'Client', dataIndex: 'lead_id', key: 'lead_id', width: 140,
      render: (leadId: string | null) => getLeadName(leadId),
    },
    { title: 'Duration', dataIndex: 'duration_seconds', key: 'duration', width: 100, render: (s: number) => formatDuration(s) },
    {
      title: 'Started', dataIndex: 'started_at', key: 'date', width: 150,
      render: (d: string) => {
        const dt = new Date(d);
        return `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      },
    },
  ];

  // ── Rank medal/color ──
  const rankStyle = (idx: number) => {
    if (idx === 0) return { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', icon: '🥇' };
    if (idx === 1) return { bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', icon: '🥈' };
    if (idx === 2) return { bg: 'linear-gradient(135deg, #CD7F32, #A0522D)', icon: '🥉' };
    return { bg: '#f5f5f5', icon: `#${idx + 1}` };
  };

  return (
    <div className="space-y-4">
      {/* Header with Real Clock */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Title level={4} style={{ margin: 0 }}>Time Tracker ⏱️</Title>
          <Text type="secondary" className="text-xs">{dateDisplay}</Text>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold" style={{ color: '#0D2137', letterSpacing: 2 }}>
            {clockDisplay}
          </div>
          <Text type="secondary" className="text-xs">Current Time</Text>
        </div>
      </div>

      {/* Timer Card */}
      <Card
        className="text-center"
        style={{
          background: isRunning
            ? 'linear-gradient(135deg, #fff1f0, #fff7e6)'
            : 'linear-gradient(135deg, #f0f5ff, #f6ffed)',
          borderColor: isRunning ? '#ff4d4f' : '#d9d9d9',
        }}
      >
        <div
          className="text-6xl font-mono font-bold mb-4"
          style={{
            color: isRunning ? '#B80F19' : '#0D2137',
            textShadow: isRunning ? '0 0 20px rgba(184,15,25,0.2)' : 'none',
            animation: isRunning ? 'pulse 2s infinite' : 'none',
          }}
        >
          {timerDisplay}
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          <Select
            value={taskType}
            onChange={setTaskType}
            style={{ width: 160 }}
            disabled={isRunning}
            options={TASK_TYPES.map(t => ({ value: t.value, label: `${t.labelAr} (${t.value})` }))}
          />
          <Input
            value={taskDesc}
            onChange={e => setTaskDesc(e.target.value)}
            placeholder="Task description..."
            disabled={isRunning}
            style={{ width: 220 }}
          />
          <Select
            value={selectedLead}
            onChange={setSelectedLead}
            style={{ width: 200 }}
            disabled={isRunning}
            allowClear
            showSearch
            placeholder="Select client..."
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={leads.map(l => ({
              value: l.id,
              label: `${l.name}${l.company ? ` — ${l.company}` : ''}`,
            }))}
          />
        </div>

        <div>
          {!isRunning ? (
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={startTimer}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', width: 180, height: 48, fontSize: 16 }}
            >
              Start Timer
            </Button>
          ) : (
            <Button
              type="primary"
              danger
              size="large"
              icon={<PauseCircleOutlined />}
              onClick={stopTimer}
              style={{ width: 180, height: 48, fontSize: 16 }}
            >
              Stop Timer
            </Button>
          )}
        </div>
      </Card>

      {/* Stats Row */}
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Today"
              value={formatDuration(todayTotal)}
              prefix={<ClockCircleOutlined style={{ color: '#1890FF' }} />}
              valueStyle={{ color: '#0D2137' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="This Week"
              value={formatDuration(weekTotal)}
              prefix={<CalendarOutlined style={{ color: '#722ED1' }} />}
              valueStyle={{ color: '#0D2137' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Today's Tasks"
              value={todayLogs.length}
              prefix={<FireOutlined style={{ color: '#FA8C16' }} />}
              valueStyle={{ color: '#0D2137' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Week Tasks"
              value={weekLogs.length}
              prefix={<TrophyOutlined style={{ color: '#52C41A' }} />}
              valueStyle={{ color: '#0D2137' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Weekly Summary + Leaderboard */}
      <Row gutter={16}>
        {/* Weekly Bar Chart */}
        <Col xs={24} lg={14}>
          <Card title={<><CalendarOutlined /> Weekly Summary</>} size="small">
            <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
              {weeklyData.map((d, i) => {
                const maxH = Math.max(...weeklyData.map(x => x.hours), 1);
                const barH = (d.hours / maxH) * 120;
                const isToday = i === weeklyData.length - 1;
                return (
                  <Tooltip key={i} title={`${d.date}: ${d.hours.toFixed(1)}h — ${d.tasks} tasks`}>
                    <div className="flex flex-col items-center flex-1">
                      <Text className="text-xs font-mono mb-1">{d.hours.toFixed(1)}h</Text>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 40,
                          height: Math.max(barH, 4),
                          borderRadius: 6,
                          background: isToday
                            ? 'linear-gradient(180deg, #B80F19, #ff4d4f)'
                            : 'linear-gradient(180deg, #0D2137, #1a3a5c)',
                          transition: 'height 0.5s ease',
                        }}
                      />
                      <Text className="text-xs mt-1" style={{ fontWeight: isToday ? 700 : 400 }}>
                        {d.day}
                      </Text>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </Card>
        </Col>

        {/* Team Leaderboard */}
        <Col xs={24} lg={10}>
          <Card title={<><TrophyOutlined style={{ color: '#FFD700' }} /> Team Leaderboard</>} size="small">
            <div className="space-y-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {team.length === 0 ? (
                <div className="text-center py-4">
                  <Text type="secondary">No team data yet</Text>
                </div>
              ) : (
                team.map((member, idx) => {
                  const rank = rankStyle(idx);
                  const maxScore = Math.max(...team.map(m => m.score), 1);
                  return (
                    <div key={member.id} className="flex items-center gap-3">
                      <Text className="text-lg w-8 text-center">{rank.icon}</Text>
                      <Avatar
                        src={member.avatar_url}
                        icon={<UserOutlined />}
                        style={{ background: idx < 3 ? rank.bg : '#e8e8e8', flexShrink: 0 }}
                        size={32}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <Text className="text-sm font-medium truncate">{member.name}</Text>
                          <Text className="text-sm font-bold" style={{ color: '#B80F19' }}>
                            {member.score} pts
                          </Text>
                        </div>
                        <Progress
                          percent={Math.round((member.score / maxScore) * 100)}
                          size="small"
                          showInfo={false}
                          strokeColor={idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : '#1890FF'}
                        />
                        <Text type="secondary" className="text-xs">
                          {formatDuration(member.totalSeconds)} · {member.taskCount} tasks this week
                        </Text>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Today's Log Table */}
      <Card title="Today's Activity Log" size="small">
        <Table
          columns={columns}
          dataSource={todayLogs}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          locale={{ emptyText: 'No tasks logged today. Start a timer!' }}
        />
      </Card>

      {/* Full Log (Collapsible) */}
      <Card title="Full History" size="small">
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, size: 'small' }}
          size="small"
        />
      </Card>

      {/* Pulse animation keyframes */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
