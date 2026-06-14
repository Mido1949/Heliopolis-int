import type { ThemeConfig } from 'antd';

/**
 * HelioMax design tokens (antd v5). Single source of truth for the dashboard
 * look & feel — brand palette, radius, typography (Latin + Arabic), and
 * component density. Applied via ConfigProvider in components/Providers.tsx.
 */
export const heliomaxTheme: ThemeConfig = {
  token: {
    colorPrimary: '#0D2137',     // deep navy — brand
    colorInfo: '#0D2137',
    colorError: '#D72B2B',       // brand red (used for primary CTAs historically)
    colorSuccess: '#16A34A',
    colorWarning: '#F5A623',
    colorLink: '#0D2137',
    borderRadius: 10,
    // Arabic-first font stack with Latin fallbacks already loaded in app/layout.tsx.
    fontFamily:
      "'Inter', 'Manrope', 'Segoe UI', 'Tahoma', 'Cairo', system-ui, -apple-system, sans-serif",
    fontSize: 14,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#F4F6F8',
    colorTextBase: '#0F172A',
    controlHeight: 38,
    wireframe: false,
  },
  components: {
    Button: { borderRadius: 10, controlHeight: 40, fontWeight: 600 },
    Input: { borderRadius: 10, controlHeight: 40 },
    Select: { borderRadius: 10, controlHeight: 40 },
    Card: { borderRadiusLG: 16 },
    Table: { borderRadius: 12, headerBg: '#F4F6F8', headerColor: '#334155', rowHoverBg: '#F8FAFC' },
    Modal: { borderRadiusLG: 16 },
    Tag: { borderRadiusSM: 6 },
    Segmented: { borderRadius: 8 },
    Notification: { borderRadiusLG: 12 },
  },
};

export default heliomaxTheme;
