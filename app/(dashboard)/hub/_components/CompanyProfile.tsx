'use client';

import { useState } from 'react';
import { Form, Input, Button, Tag, message, Spin } from 'antd';
import { useOrg } from '@/context/OrgContext';

interface ProfileForm {
  name: string;
  industry: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
}

export default function CompanyProfile() {
  const { org, orgModules } = useOrg();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ProfileForm>();

  if (!org) return <Spin />;

  const settings = (org.settings ?? {}) as Record<string, string>;

  const handleEdit = () => {
    form.setFieldsValue({
      name: org.name,
      industry: org.industry ?? '',
      primary_color: org.brand_colors?.primary ?? '#000000',
      secondary_color: org.brand_colors?.secondary ?? '#000000',
      contact_email: settings.contact_email ?? '',
      contact_phone: settings.contact_phone ?? '',
      address: settings.address ?? '',
      website: settings.website ?? '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    const res = await fetch('/api/hub/update-org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name,
        industry: values.industry,
        brand_colors: {
          primary: values.primary_color,
          secondary: values.secondary_color,
        },
        settings: {
          ...settings,
          contact_email: values.contact_email,
          contact_phone: values.contact_phone,
          address: values.address,
          website: values.website,
        },
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) {
      message.error(data.error);
    } else {
      message.success('Profile updated');
      setEditing(false);
      window.location.reload();
    }
  };

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-6 max-w-2xl">
        <h2 className="text-lg font-bold text-[#0D2137] mb-6">Edit Company Profile</h2>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Organization Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="industry" label="Industry">
            <Input placeholder="e.g. hvac, ecommerce, education" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="primary_color" label="Primary Brand Color">
              <Input type="color" className="h-10 w-full" />
            </Form.Item>
            <Form.Item name="secondary_color" label="Secondary Brand Color">
              <Input type="color" className="h-10 w-full" />
            </Form.Item>
          </div>
          <Form.Item name="contact_email" label="Contact Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="contact_phone" label="Contact Phone">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input placeholder="https://" />
          </Form.Item>
          <div className="flex gap-3 mt-2">
            <Button type="primary" loading={saving} onClick={handleSave}>Save</Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </Form>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {org.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="w-16 h-16 object-contain rounded-lg border border-slate-100" />
          ) : (
            <div className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-black text-white"
              style={{ backgroundColor: org.brand_colors?.primary ?? '#0D2137' }}>
              {org.name.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-[#0D2137]">{org.name}</h2>
            <p className="text-sm text-slate-500 capitalize">{org.industry ?? '—'}</p>
          </div>
        </div>
        <Button onClick={handleEdit}>Edit Profile</Button>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Brand Colors</p>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border border-slate-200"
              style={{ backgroundColor: org.brand_colors?.primary ?? '#ccc' }} />
            <span className="text-sm text-slate-600">{org.brand_colors?.primary ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border border-slate-200"
              style={{ backgroundColor: org.brand_colors?.secondary ?? '#ccc' }} />
            <span className="text-sm text-slate-600">{org.brand_colors?.secondary ?? '—'}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contact Info</p>
        <div className="space-y-2 text-sm text-slate-700">
          <p><span className="font-medium w-28 inline-block">Email:</span>{settings.contact_email || '—'}</p>
          <p><span className="font-medium w-28 inline-block">Phone:</span>{settings.contact_phone || '—'}</p>
          <p><span className="font-medium w-28 inline-block">Address:</span>{settings.address || '—'}</p>
          <p><span className="font-medium w-28 inline-block">Website:</span>{settings.website || '—'}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Enabled Modules</p>
        <div className="flex flex-wrap gap-2">
          {orgModules.map(m => (
            <Tag key={m.module.name} color="blue">{m.module.display_name}</Tag>
          ))}
        </div>
      </div>
    </div>
  );
}