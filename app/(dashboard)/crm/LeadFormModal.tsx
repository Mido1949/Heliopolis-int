'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, Upload, Row, Col, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { createClient } from '@/lib/supabase/client';
import { logLeadActivity } from '@/lib/supabase/activities';
import { LEAD_SOURCES, REGIONS, LEAD_CLIENT_TYPES, PIPELINE_STAGES } from '@/lib/constants';
import type { Lead } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface LeadFormModalProps {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSaved: () => void;
  defaultRegion?: string;
}

export default function LeadFormModal({ open, lead, onClose, onSaved, defaultRegion }: LeadFormModalProps) {
  const { user } = useAuth();
  const { currentOrgId } = useOrg();
  const [form] = Form.useForm();
  const supabase = createClient();
  const isEdit = !!lead;
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!open) return;
    supabase.from('profiles').select('id, name').order('name')
      .then(({ data }) => setOwners((data || []) as { id: string; name: string }[]));
  }, [open, supabase]);

  useEffect(() => {
    if (!open) { setFileList([]); return; }
    if (lead) {
      form.setFieldsValue({
        ...lead,
        next_follow_up: lead.next_follow_up ? dayjs(lead.next_follow_up) : null,
      });
    } else {
      form.resetFields();
      if (defaultRegion) {
        form.setFieldsValue({ region: defaultRegion });
      }
    }
  }, [open, lead, form, defaultRegion]);

  const handleSubmit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        deal_value: values.deal_value ? Number(values.deal_value) : null,
        next_follow_up: values.next_follow_up ? values.next_follow_up.toISOString() : null,
        pipeline_stage: values.pipeline_stage || 'NEW',
        stage_timestamps: isEdit
          ? lead!.stage_timestamps
          : { [values.pipeline_stage || 'NEW']: new Date().toISOString() },
      };

      if (isEdit) {
        const { error } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', lead!.id);
        if (error) throw error;

        // Non-blocking activity logs
        logLeadActivity(lead!.id, 'edit', {
          changes: Object.keys(values).filter(k => values[k] !== lead![k as keyof Lead])
        });

        message.success('تم تحديث العميل بنجاح (Lead updated)');
      } else {
        const { data, error } = await supabase
          .from('leads')
          .insert({
            ...payload,
            org_id: currentOrgId,
            assigned_to_user: values.assigned_to_user || user?.id,
            created_by: user?.id,
          })
          .select()
          .single();
        if (error) throw error;

        // Non-blocking activity log
        if (data) {
          logLeadActivity(data.id, 'creation');
          // Upload attachments after insert
          if (fileList.length) {
            for (const f of fileList) {
              if (f.originFileObj) {
                const fd = new FormData();
                fd.append('file', f.originFileObj as File);
                await fetch('/api/files/upload', { method: 'POST', body: fd });
              }
            }
          }
        }

        message.success('تم إضافة العميل بنجاح (Lead created)');
      }

      onSaved();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error('حدث خطأ أثناء الحفظ');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
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
      okButtonProps={{ style: { backgroundColor: '#D72B2B', borderColor: '#D72B2B' }, loading: submitting, disabled: submitting }}
      width={640}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ source: 'Meta Ad', pipeline_stage: 'NEW' }}
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
          <Col span={24}>
            <Form.Item
              name="client_type"
              label="نوع العميل (Client Type)"
              rules={[{ required: true, message: 'نوع العميل مطلوب' }]}
            >
              <Select
                placeholder="اختر نوع العميل"
                options={LEAD_CLIENT_TYPES.map((t) => ({
                  value: t.value,
                  label: t.labelAr,
                }))}
              />
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

        {/* ② Classification */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="source" label="المصدر (Source)">
              <Select
                options={LEAD_SOURCES.map((s) => ({
                  value: s.value,
                  label: s.labelAr,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="region" label="المنطقة (Region)">
              <Select
                allowClear
                placeholder="اختر"
                options={REGIONS.map((r) => ({
                  value: r.value,
                  label: r.labelAr,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* ③ Project */}
        <Form.Item name="project_description" label="وصف المشروع (Project)">
          <TextArea rows={2} placeholder="ما أرسله العميل عن مشروعه..." />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="project_capacity" label="السعة المطلوبة (Capacity)">
              <Input placeholder="مثال: 10 طن / 8 HP" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="deal_value" label="القيمة المتوقعة (Expected Value)">
              <Input type="number" placeholder="EGP" />
            </Form.Item>
          </Col>
        </Row>

        {/* ④ Pipeline & ownership */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="pipeline_stage" label="المرحلة (Stage)">
              <Select
                options={PIPELINE_STAGES.map((s) => ({
                  value: s.value,
                  label: `${s.emoji} ${s.labelAr}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="assigned_to_user" label="المسؤول (Owner)">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="اختر المسؤول"
                options={owners.map((o) => ({ value: o.id, label: o.name }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* ⑤ Attachments */}
        <Form.Item label="المرفقات (Attachments)">
          <Upload
            multiple
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
          >
            <Button icon={<UploadOutlined />}>اختر ملفات</Button>
          </Upload>
        </Form.Item>

        {/* ⑥ Follow-up & Notes */}
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
