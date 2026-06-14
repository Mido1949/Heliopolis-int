'use client';

import { useState, useEffect } from 'react';
import { Calendar, Badge, Modal, Form, Input, Select, DatePicker, Button, message } from 'antd';
import { createBrowserClient } from '@supabase/ssr';
import type { Dayjs } from 'dayjs';
import { useOrg } from '@/context/OrgContext';

type Post = {
  id: string;
  title: string;
  platform: string;
  status: string;
  scheduled_for: string;
  caption: string | null;
};

const PLATFORMS = ['instagram','facebook','tiktok','linkedin','email','whatsapp'];
const STATUS_COLORS: Record<string, string> = {
  draft: 'default', scheduled: 'processing', published: 'success', cancelled: 'error',
};

export default function ContentCalendarClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { org } = useOrg();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.from('content_posts').select('*').order('scheduled_for').then(({ data }) => {
      setPosts(data ?? []);
    });
  }, [supabase]);

  const getPostsForDate = (date: Dayjs) =>
    posts.filter(p => p.scheduled_for && p.scheduled_for.startsWith(date.format('YYYY-MM-DD')));

  const dateCellRender = (date: Dayjs) => {
    const dayPosts = getPostsForDate(date);
    return (
      <ul className="list-none p-0 m-0">
        {dayPosts.map(p => (
          <li key={p.id}>
            <Badge status={STATUS_COLORS[p.status] as 'default'} text={p.title} />
          </li>
        ))}
      </ul>
    );
  };

  const handleSelectDate = (date: Dayjs) => {
    form.setFieldValue('scheduled_for', date);
    setModalOpen(true);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase
      .from('organization_members').select('org_id').eq('user_id', user!.id).single();

    const { error } = await supabase.from('content_posts').insert({
      ...values,
      org_id: membership!.org_id,
      created_by: user!.id,
      scheduled_for: (values.scheduled_for as Dayjs).toISOString(),
    });

    if (error) { message.error(error.message); return; }
    message.success('Post scheduled');
    setModalOpen(false);
    form.resetFields();
    const { data } = await supabase.from('content_posts').select('*').order('scheduled_for');
    setPosts(data ?? []);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Content Calendar — {org?.name}</h1>
        <Button type="primary" onClick={() => setModalOpen(true)}>+ New Post</Button>
      </div>

      <Calendar cellRender={dateCellRender} onSelect={handleSelectDate} />

      <Modal title="Schedule Post" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="Post Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="platform" label="Platform" rules={[{ required: true }]}>
            <Select options={PLATFORMS.map(p => ({ label: p, value: p }))} />
          </Form.Item>
          <Form.Item name="caption" label="Caption">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="scheduled_for" label="Date & Time" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="draft">
            <Select options={['draft','scheduled','published','cancelled'].map(s => ({ label: s, value: s }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Save Post</Button>
        </Form>
      </Modal>
    </div>
  );
}