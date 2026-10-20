'use client';

import { useRouter } from 'next/navigation';
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
  lead: Pick<Lead, 'id' | 'name' | 'phone' | 'pipeline_stage'>;
  /** 'icon' = compact icon (kanban card); 'button' = bordered button (drawer). */
  variant?: 'icon' | 'button';
}

/**
 * WhatsApp action on a lead. The main control opens the lead's chat inside the
 * CRM (/whatsapp), so the reply goes out from the company number and is logged.
 * The caret still offers the stage templates as a `wa.me` link on the rep's own
 * phone, for when the 24-hour window is closed. Never sends on its own.
 */
export default function WhatsAppTemplateButton({ lead, variant = 'icon' }: WhatsAppTemplateButtonProps) {
  const phone = lead.phone || '';
  const stage = (lead.pipeline_stage || 'NEW') as PipelineStage;
  const defaultKey = defaultTemplateKeyForStage(stage);
  const router = useRouter();
  const openChat = () => router.push(`/whatsapp?lead=${lead.id}`);

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
    label: `📱 ${t.key === defaultKey ? `${t.labelAr} • المرحلة الحالية` : t.labelAr} (من موبايلك)`,
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
          onClick={openChat}
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
      <Tooltip title="افتح الشات في واتساب الـCRM">
        <Dropdown.Button
          trigger={['click']}
          menu={menu}
          onClick={openChat}
          style={{ width: 'auto' }}
          icon={<span style={{ fontSize: 10 }}>▾</span>}
        >
          <WhatsAppOutlined style={{ color: '#25D366' }} />
        </Dropdown.Button>
      </Tooltip>
    </span>
  );
}
