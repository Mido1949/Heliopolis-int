'use client';

import { useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, message } from 'antd';
import { createClient } from '@/lib/supabase/client';
import { logLeadActivity } from '@/lib/supabase/activities';
import { LEAD_STATUSES, LEAD_SOURCES, REGIONS } from '@/lib/constants';
import type { Lead } from '@/types';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface LeadFormModalProps {
  open: boolean;
  lead: Lead | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export default function LeadFormModal({ open, lead, onClose, onSaved }: LeadFormModalProps) {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const supabase = createClient();
  const isEdit = !!lead;

  useEffect(() => {
    if (open && lead) {
      form.setFieldsValue({
        ...lead,
        next_follow_up: lead.next_follow_up ? dayjs(lead.next_follow_up) : null,
      });
    } else if (open) {
      form.resetFields();
    }
  }, [open, lead, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        next_follow_up: values.next_follow_up
          ? values.next_follow_up.toISOString()
          : null,
      };

      if (isEdit) {
        const { error } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', lead!.id);
        if (error) throw error;
        
        // Log update
        await logLeadActivity(lead!.id, 'edit', { 
          changes: Object.keys(values).filter(k => values[k] !== lead![k as keyof Lead]) 
        });
        
        message.success('تم تحديث العميل بنجاح (Lead updated)');
      } else {
        const { data, error } = await supabase
          .from('leads')
          .insert({ ...payload, assigned_to: user?.id })
          .select()
          .single();
        if (error) throw error;
        
        // Log creation
        if (data) {
          await logLeadActivity(data.id, 'creation');
        }
        
        message.success('تم إضافة العميل بنجاح (Lead created)');
      }

      onSaved();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
      message.error('حدث خطأ أثناء الحفظ');
    }
  };

  return (
    <Modal
      title={isEdit ? 'تعديل عميل (Edit Lead)' : 'إضافة عميل جديد (New Lead)'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'تحديث (Update)' : 'إضافة (Add)'}
      cancelText="إلغاء (Cancel)"
      okButtonProps={{ style: { backgroundColor: '#D72B2B', borderColor: '#D72B2B' } }}
      width={640}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ status: 'New', source: 'Direct' }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="name"
              label="الاسم (Name)"
              rules={[{ required: true, message: 'مطلوب' }]}
            >
              <Input placeholder="اسم العميل" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="company" label="الشركة (Company)">
              <Input placeholder="اسم الشركة" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="phone" label="الهاتف (Phone)">
              <Input placeholder="+201xxxxxxxxx" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="email"
              label="البريد (Email)"
              rules={[{ type: 'email', message: 'بريد غير صالح' }]}
            >
              <Input placeholder="email@example.com" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="status" label="الحالة (Status)">
              <Select
                options={LEAD_STATUSES.map((s) => ({
                  value: s.value,
                  label: `${s.labelAr} (${s.value})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="source" label="المصدر (Source)">
              <Select
                options={LEAD_SOURCES.map((s) => ({
                  value: s.value,
                  label: `${s.labelAr} (${s.value})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="region" label="المنطقة (Region)">
              <Select
                allowClear
                placeholder="اختر"
                options={REGIONS.map((r) => ({
                  value: r.value,
                  label: `${r.labelAr} (${r.value})`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="next_follow_up" label="المتابعة القادمة (Next Follow-up)">
          <DatePicker className="w-full" placeholder="اختر التاريخ" />
        </Form.Item>

        <Form.Item name="notes" label="ملاحظات (Notes)">
          <TextArea rows={3} placeholder="ملاحظات إضافية..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
