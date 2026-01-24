import type { ThemeConfig } from 'antd';

/**
 * Honey Beegood Color Palette
 *
 * Design reference: honeybeegood.be
 * Applied per Architecture AR19 and UX Design Specification
 */
export const colors = {
  /** Primary accent color - buttons, CTAs, active states */
  seaBuckthorn: '#f7a42d',
  /** Page and container background */
  coconutCream: '#fbf9e7',
  /** Body text, headings, dark sections */
  brownBramble: '#662604',
  /** Card backgrounds, secondary accent */
  salomie: '#fcd483',
} as const;

/**
 * APIS Dashboard Theme Configuration
 *
 * Implements Ant Design 5.x token-based theming system.
 * Provides warm, honey-themed appearance per UX requirements.
 */
export const apisTheme: ThemeConfig = {
  token: {
    // Core color tokens
    colorPrimary: colors.seaBuckthorn,
    colorBgContainer: colors.coconutCream,
    colorText: colors.brownBramble,
    colorBgElevated: colors.salomie,
    colorBgLayout: colors.coconutCream,

    // Border radius for soft, natural feel
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // System font stack (per UX spec)
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

    // Ensure white text on solid color backgrounds (primary buttons, etc.)
    colorTextLightSolid: '#ffffff',
  },
  components: {
    Card: {
      borderRadiusLG: 12,
      colorBgContainer: colors.salomie,
      // Subtle shadow with brown tint for natural warmth
      boxShadowTertiary: '0 2px 8px rgba(102, 38, 4, 0.08)',
    },
    Layout: {
      bodyBg: colors.coconutCream,
      headerBg: colors.brownBramble,
      siderBg: colors.brownBramble,
    },
    Segmented: {
      // Ensure Segmented control follows theme
      itemSelectedBg: colors.seaBuckthorn,
      itemSelectedColor: '#ffffff',
    },
  },
};

export default apisTheme;
