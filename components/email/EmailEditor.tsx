'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message, Spin } from 'antd';
import { createClient } from '@/lib/supabase/client';
import { Lead } from '@/types';

const { TextArea } = Input;
const { Option } = Select;

interface EmailEditorProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmailEditor({ open, onClose, onSuccess }: EmailEditorProps) {
  const supabase = createClient();
  const [form] = Form.useForm();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchLeads();
      form.resetFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchLeads = async () => {
    setLoading(true);
    // Fetch leads that have an email address
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, email, company')
      .not('email', 'is', null)
      .neq('email', '');
      
    if (error) {
      message.error('Failed to load leads');
      console.error(error);
    } else {
      setLeads(data as Lead[]);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      if (!userId) throw new Error('Not authenticated');

      // 1. Create the Campaign
      const { data: campaignData, error: campaignError } = await supabase
        .from('email_campaigns')
        .insert({
          subject: values.subject,
          from_name: values.from_name,
          body: values.body,
          status: 'Draft',
          created_by: userId
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // 2. Create Recipients
      if (values.recipient_ids && values.recipient_ids.length > 0) {
        const recipientsToInsert = values.recipient_ids.map((leadId: string) => ({
          campaign_id: campaignData.id,
          lead_id: leadId,
          status: 'pending'
        }));

        const { error: recipientError } = await supabase
          .from('email_recipients')
          .insert(recipientsToInsert);

        if (recipientError) throw recipientError;
      }

      message.success('Campaign Draft Created');
      onSuccess();
    } catch (error: unknown) {
      console.error(error);
      message.error((error as Error).message || 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="حملة بريد جديدة (New Campaign)"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="حفظ مسودة (Save Draft)"
      cancelText="إلغاء (Cancel)"
      confirmLoading={submitting}
      okButtonProps={{ style: { backgroundColor: '#D72B2B', borderColor: '#D72B2B' } }}
      width={700}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item 
            name="subject" 
            label="الموضوع (Subject)" 
            rules={[{ required: true, message: 'مطلوب' }]}
          >
            <Input placeholder="موضوع البريد" size="large" />
          </Form.Item>

          <Form.Item 
            name="from_name" 
            label="اسم المرسل (From Name)" 
            rules={[{ required: true, message: 'مطلوب' }]}
            initialValue="Loomark"
          >
            <Input placeholder="اسمك أو اسم الشركة" size="large" />
          </Form.Item>
          
          <Form.Item 
            name="recipient_ids" 
            label="المستلمون (Recipients)"
            rules={[{ required: true, message: 'Select at least one recipient' }]}
            extra="Select leads to receive this email. Only leads with email addresses are shown."
          >
            <Select
              mode="multiple"
              placeholder="Select recipients"
              size="large"
              allowClear
              filterOption={(input, option) =>
                (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())
              }
            >
              <Option value="all">
                <span className="font-semibold text-primary">All Leads ({leads.length})</span>
              </Option>
              {leads.map((lead) => (
                <Option key={lead.id} value={lead.id}>
                  {lead.name} {lead.company ? `(${lead.company})` : ''} - {lead.email}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item 
            name="body" 
            label="المحتوى (Body HTML)" 
            rules={[{ required: true, message: 'مطلوب' }]}
            extra="You can use standard HTML to format your email"
          >
            <TextArea rows={10} placeholder="<h1>Hello</h1><p>We are glad to announce...</p>" className="font-mono text-sm" />
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
}
