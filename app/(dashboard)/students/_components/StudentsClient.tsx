'use client';

import { useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { createBrowserClient } from '@supabase/ssr';

type Student = {
  id: string; name: string; email: string | null; phone: string | null;
  grade: string | null; status: string; enrollment_date: string; notes: string | null;
};

const STATUS_COLOR: Record<string, string> = { active: 'green', inactive: 'default', graduated: 'blue' };

export default function StudentsClient({ initialStudents }: { initialStudents: Student[] }) {
  const [students, setStudents] = useState(initialStudents);
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
      .from('students')
      .insert({ ...values, org_id: membership!.org_id })
      .select()
      .single();

    if (error) { message.error(error.message); return; }
    setStudents(prev => [data, ...prev]);
    setModalOpen(false);
    form.resetFields();
    message.success('Student added');
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Grade', dataIndex: 'grade', key: 'grade' },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    { title: 'Enrolled', dataIndex: 'enrollment_date', key: 'enrollment_date' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Student Management</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Add Student
        </Button>
      </div>

      <Table dataSource={students} columns={columns} rowKey="id" />

      <Modal title="Add Student" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="name" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="grade" label="Grade / Level"><Input /></Form.Item>
          <Form.Item name="status" label="Status" initialValue="active">
            <Select options={['active','inactive','graduated'].map(s => ({ label: s, value: s }))} />
          </Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea /></Form.Item>
          <Button type="primary" htmlType="submit" block>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}