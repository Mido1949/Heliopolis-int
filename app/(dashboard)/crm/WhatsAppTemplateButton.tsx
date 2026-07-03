'use client';

import { Dropdown, Tooltip, message } from 'antd';
import type { MenuProps } from 'antd';
import { WhatsAppOutlined } from '@ant-design/icons';
import type { Lead, PipelineStage } from '@/types';
import {
  WHATSAPP_TEMPLATES,
  buildWhatsAppUrlForTemplate,
  defaultTemplateKeyForStage,
  type WhatsAppTemplateKey,
} from '@/lib/whatsapp';

interface WhatsAppTemplateButtonProps {
  lead: Pick<Lead, 'name' | 'phone' | 'pipeline_stage'>;
  /** 'icon' = compact icon (kanban card); 'button' = bordered button (drawer). */
  variant?: 'icon' | 'button';
}

/**
 * Stage-aware WhatsApp action (spec 005 US3). A single tap on the main control
 * opens WhatsApp pre-filled with the lead's current-stage template; the caret
 * opens a picker of all templates (≤ 2 taps to any template). Fully manual —
 * only opens a `wa.me` deep link, never sends on its own.
 */
export default function WhatsAppTemplateButton({ lead, variant = 'icon' }: WhatsAppTemplateButtonProps) {
  const phone = lead.phone || '';
  const stage = (lead.pipeline_stage || 'NEW') as PipelineStage;
  const defaultKey = defaultTemplateKeyForStage(stage);

  const open = (key: WhatsAppTemplateKey) => {
    const url = buildWhatsAppUrlForTemplate(phone, key, lead);
    if (url === '#') {
      message.warning('رقم هاتف غير صالح');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Default (stage) template first, then the rest — so the picker leads with
  // the most likely choice.
  const orderedTemplates = [
    ...WHATSAPP_TEMPLATES.filter((t) => t.key === defaultKey),
    ...WHATSAPP_TEMPLATES.filter((t) => t.key !== defaultKey),
  ];

  const items: MenuProps['items'] = orderedTemplates.map((t) => ({
    key: t.key,
    label: t.key === defaultKey ? `${t.labelAr} • المرحلة الحالية` : t.labelAr,
  }));

  const menu: MenuProps = {
    items,
    onClick: ({ key }) => open(key as WhatsAppTemplateKey),
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (variant === 'icon') {
    // Compact: the icon itself sends the stage template; caret opens the picker.
    return (
      <span onClick={stop} className="inline-flex">
        <Dropdown.Button
          size="small"
          type="text"
          trigger={['click']}
          menu={menu}
          onClick={() => open(defaultKey)}
          icon={<span style={{ fontSize: 10 }}>▾</span>}
          buttonsRender={([left, right]) => [left, right]}
        >
          <WhatsAppOutlined style={{ color: '#25D366', fontSize: '14px' }} />
        </Dropdown.Button>
      </span>
    );
  }

  return (
    <span onClick={stop}>
      <Tooltip title="WhatsApp — رسالة حسب المرحلة">
        <Dropdown.Button
          trigger={['click']}
          menu={menu}
          onClick={() => open(defaultKey)}
          style={{ width: 'auto' }}
          icon={<span style={{ fontSize: 10 }}>▾</span>}
        >
          <WhatsAppOutlined style={{ color: '#25D366' }} />
        </Dropdown.Button>
      </Tooltip>
    </span>
  );
}
