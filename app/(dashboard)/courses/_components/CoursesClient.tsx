'use client';

import { useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, DatePicker, InputNumber, Select, message, Progress } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { createBrowserClient } from '@supabase/ssr';

type Course = {
  id: string; name: string; instructor: string | null; start_date: string | null;
  end_date: string | null; schedule: string | null; max_students: number | null;
  enrolled_count: number; status: string; price: number | null;
};

const STATUS_COLOR: Record<string, string> = {
  upcoming: 'blue', active: 'green', completed: 'default', cancelled: 'error',
};

export default function CoursesClient({ initialCourses }: { initialCourses: Course[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleAdd = async (values: Record<string, unknown>) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase
      .from('organization_members').select('org_id').eq('user_id', user!.id).single();

    const { data, error } = await supabase
      .from('courses')
      .insert({
        ...values,
        org_id: membership!.org_id,
        start_date: values.start_date ? (values.start_date as { format: (s: string) => string }).format('YYYY-MM-DD') : null,
        end_date: values.end_date ? (values.end_date as { format: (s: string) => string }).format('YYYY-MM-DD') : null,
      })
      .select()
      .single();

    if (error) { message.error(error.message); return; }
    setCourses(prev => [...prev, data]);
    setModalOpen(false);
    form.resetFields();
    message.success('Course added');
  };

  const columns = [
    { title: 'Course', dataIndex: 'name' },
    { title: 'Instructor', dataIndex: 'instructor' },
    { title: 'Schedule', dataIndex: 'schedule' },
    { title: 'Starts', dataIndex: 'start_date' },
    { title: 'Ends', dataIndex: 'end_date' },
    {
      title: 'Enrollment',
      render: (_: unknown, r: Course) => r.max_students ? (
        <Progress percent={Math.round((r.enrolled_count / r.max_students) * 100)}
          format={() => `${r.enrolled_count}/${r.max_students}`} size="small" />
      ) : r.enrolled_count,
    },
    { title: 'Price', dataIndex: 'price', render: (p: number) => p ? `EGP ${p}` : '-' },
    {
      title: 'Status', dataIndex: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Course Scheduler</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Add Course
        </Button>
      </div>

      <Table dataSource={courses} columns={columns} rowKey="id" />

      <Modal title="Add Course" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="name" label="Course Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="instructor" label="Instructor"><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea /></Form.Item>
          <Form.Item name="schedule" label="Schedule (e.g. Mon/Wed 6-8pm)"><Input /></Form.Item>
          <div className="flex gap-4">
            <Form.Item name="start_date" label="Start Date" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="end_date" label="End Date" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="flex gap-4">
            <Form.Item name="max_students" label="Max Students" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="price" label="Price (EGP)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="status" label="Status" initialValue="upcoming">
            <Select options={['upcoming','active','completed','cancelled'].map(s => ({ label: s, value: s }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Save Course</Button>
        </Form>
      </Modal>
    </div>
  );
}