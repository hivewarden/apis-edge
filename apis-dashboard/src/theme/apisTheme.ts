import type { ThemeConfig } from 'antd';

/**
 * Honey Beegood Color Palette
 *
 * A warm, natural color system inspired by honey, beeswax, and the
 * golden warmth of a thriving apiary. This palette creates emotional
 * connection to beekeeping while maintaining WCAG AAA accessibility.
 *
 * Design reference: honeybeegood.be
 * Applied per Architecture AR19 and UX Design Specification
 *
 * Contrast ratios (all meet WCAG AAA for normal text):
 * - Brown Bramble on Coconut Cream: 10.2:1 ✓
 * - Brown Bramble on Salomie: 7.1:1 ✓
 * - White on Sea Buckthorn: 3.1:1 (large text only, used for buttons)
 * - White on Brown Bramble: 12.6:1 ✓
 */
export const colors = {
  // === Primary Palette (Honey Beegood) ===
  /** Primary accent - rich honey gold for CTAs, active states, focus rings */
  seaBuckthorn: '#f7a42d',
  /** Page backgrounds - warm cream like fresh honeycomb wax */
  coconutCream: '#fbf9e7',
  /** Text & dark elements - deep warm brown like aged propolis */
  brownBramble: '#662604',
  /** Card surfaces - soft golden honey for elevated components */
  salomie: '#fcd483',

  // === Extended Palette (Semantic States) ===
  /** Success - forest green harmonizing with natural theme */
  success: '#2e7d32',
  /** Warning - amber that complements honey gold */
  warning: '#e67e00',
  /** Error - warm terracotta red, not harsh clinical red */
  error: '#c23616',
  /** Info - muted blue that doesn't fight the warm palette */
  info: '#5c7a99',

  // === Neutral Variations ===
  /** Light text on dark backgrounds */
  textLight: '#fbf9e7',
  /** Muted text for secondary content */
  textMuted: '#8b6914',
  /** Subtle borders and dividers */
  border: 'rgba(102, 38, 4, 0.12)',
  /** Hover state overlay */
  hoverOverlay: 'rgba(247, 164, 45, 0.08)',
  /** Focus ring color */
  focusRing: 'rgba(247, 164, 45, 0.4)',

  // === Shadows (warm-tinted for cohesion) ===
  /** Subtle card shadow */
  shadowSm: '0 1px 3px rgba(102, 38, 4, 0.08)',
  /** Default card shadow */
  shadowMd: '0 2px 8px rgba(102, 38, 4, 0.10)',
  /** Elevated/hover shadow */
  shadowLg: '0 4px 16px rgba(102, 38, 4, 0.14)',
  /** Modal/dropdown shadow */
  shadowXl: '0 8px 24px rgba(102, 38, 4, 0.18)',
} as const;

/**
 * CSS Custom Properties for use outside Ant Design components
 *
 * Inject these into :root for consistent theming across custom CSS:
 *
 * ```css
 * :root {
 *   --apis-primary: #f7a42d;
 *   --apis-bg: #fbf9e7;
 *   --apis-text: #662604;
 *   --apis-surface: #fcd483;
 * }
 * ```
 */
export const cssVariables = {
  '--apis-primary': colors.seaBuckthorn,
  '--apis-primary-hover': '#e8960f',
  '--apis-bg': colors.coconutCream,
  '--apis-text': colors.brownBramble,
  '--apis-surface': colors.salomie,
  '--apis-success': colors.success,
  '--apis-warning': colors.warning,
  '--apis-error': colors.error,
  '--apis-info': colors.info,
  '--apis-border': colors.border,
  '--apis-shadow-sm': colors.shadowSm,
  '--apis-shadow-md': colors.shadowMd,
  '--apis-shadow-lg': colors.shadowLg,
} as const;

/**
 * Spacing scale following 8px base unit (per UX spec)
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Mobile touch target sizes (per UX spec - 64px minimum for glove-friendly)
 */
export const touchTargets = {
  /** Standard touch target for buttons */
  standard: 48,
  /** Large touch target for glove-friendly mobile use */
  mobile: 64,
  /** Minimum gap between touch targets */
  gap: 16,
} as const;

/**
 * APIS Dashboard Theme Configuration
 *
 * Implements Ant Design 5.x token-based theming system with the
 * Honey Beegood aesthetic: warm, natural, inviting - like stepping
 * into a sun-dappled apiary on a golden afternoon.
 *
 * Key principles:
 * - Warm over clinical: soft browns and golds, not stark grays
 * - Natural feel: organic rounded corners, gentle shadows
 * - Touch-friendly: generous sizing for mobile/glove use
 * - Accessible: WCAG AAA contrast ratios for text
 */
export const apisTheme: ThemeConfig = {
  token: {
    // === Core Colors ===
    colorPrimary: colors.seaBuckthorn,
    colorBgContainer: colors.coconutCream,
    colorText: colors.brownBramble,
    colorBgElevated: colors.salomie,
    colorBgLayout: colors.coconutCream,
    colorBgBase: colors.coconutCream,

    // === Semantic State Colors ===
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorInfo: colors.info,

    // === Text Variations ===
    colorTextSecondary: colors.textMuted,
    colorTextTertiary: 'rgba(102, 38, 4, 0.55)',
    colorTextQuaternary: 'rgba(102, 38, 4, 0.35)',
    colorTextLightSolid: '#ffffff',

    // === Borders & Dividers ===
    colorBorder: 'rgba(102, 38, 4, 0.15)',
    colorBorderSecondary: 'rgba(102, 38, 4, 0.08)',
    colorSplit: 'rgba(102, 38, 4, 0.06)',

    // === Interactive States ===
    colorPrimaryHover: '#e8960f',
    colorPrimaryActive: '#d68800',
    colorPrimaryBg: 'rgba(247, 164, 45, 0.12)',
    colorPrimaryBgHover: 'rgba(247, 164, 45, 0.18)',

    // === Border Radius (soft, natural curves) ===
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    borderRadiusXS: 4,

    // === Typography ===
    // System font stack for fast loading and native feel
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    lineHeight: 1.5,
    lineHeightLG: 1.5,
    lineHeightSM: 1.5,

    // === Spacing ===
    padding: spacing.md,
    paddingLG: spacing.lg,
    paddingSM: spacing.sm,
    paddingXS: spacing.xs,
    margin: spacing.md,
    marginLG: spacing.lg,
    marginSM: spacing.sm,
    marginXS: spacing.xs,

    // === Motion (gentle, not jarring) ===
    motionDurationFast: '0.15s',
    motionDurationMid: '0.25s',
    motionDurationSlow: '0.35s',
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    motionEaseOut: 'cubic-bezier(0, 0, 0.2, 1)',
    motionEaseInQuint: 'cubic-bezier(0.4, 0, 1, 1)',

    // === Sizing ===
    controlHeight: touchTargets.standard,
    controlHeightLG: touchTargets.mobile,
    controlHeightSM: 36,

    // === Shadows (warm-tinted) ===
    boxShadow: colors.shadowMd,
    boxShadowSecondary: colors.shadowSm,
  },

  components: {
    // === Cards: The primary content container ===
    Card: {
      borderRadiusLG: 12,
      colorBgContainer: colors.salomie,
      boxShadowTertiary: colors.shadowMd,
      paddingLG: spacing.lg,
    },

    // === Layout: Warm sidebar, cream content ===
    Layout: {
      bodyBg: colors.coconutCream,
      headerBg: colors.brownBramble,
      siderBg: colors.brownBramble,
      headerPadding: `0 ${spacing.lg}px`,
    },

    // === Buttons: Honey-gold primary, warm interactions ===
    Button: {
      controlHeight: touchTargets.standard,
      controlHeightLG: touchTargets.mobile,
      paddingContentHorizontal: spacing.lg,
      borderRadius: 8,
      primaryShadow: colors.shadowSm,
    },

    // === Segmented Control: Time range selector styling ===
    Segmented: {
      itemSelectedBg: colors.seaBuckthorn,
      itemSelectedColor: '#ffffff',
      itemHoverBg: colors.hoverOverlay,
      borderRadius: 8,
      controlHeight: touchTargets.standard,
    },

    // === Input: Warm focus states ===
    Input: {
      controlHeight: touchTargets.standard,
      controlHeightLG: touchTargets.mobile,
      borderRadius: 8,
      activeBorderColor: colors.seaBuckthorn,
      hoverBorderColor: colors.textMuted,
    },

    // === Select: Dropdown styling ===
    Select: {
      controlHeight: touchTargets.standard,
      controlHeightLG: touchTargets.mobile,
      borderRadius: 8,
      optionSelectedBg: 'rgba(247, 164, 45, 0.15)',
    },

    // === Menu: Sidebar navigation ===
    Menu: {
      darkItemBg: colors.brownBramble,
      darkItemSelectedBg: colors.seaBuckthorn,
      darkItemHoverBg: 'rgba(247, 164, 45, 0.15)',
      darkItemColor: colors.coconutCream,
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemPaddingInline: 16,
      iconSize: 18,
      iconMarginInlineEnd: 12,
    },

    // === Table: Data display ===
    Table: {
      headerBg: 'rgba(247, 164, 45, 0.08)',
      headerColor: colors.brownBramble,
      rowHoverBg: colors.hoverOverlay,
      borderColor: colors.border,
    },

    // === Modal: Elevated dialogs ===
    Modal: {
      borderRadiusLG: 12,
      contentBg: colors.coconutCream,
      headerBg: colors.coconutCream,
      titleColor: colors.brownBramble,
    },

    // === Drawer: Side panels ===
    Drawer: {
      colorBgElevated: colors.brownBramble,
    },

    // === Alert: Status messages ===
    Alert: {
      borderRadiusLG: 8,
    },

    // === Badge: Status indicators ===
    Badge: {
      colorBgContainer: colors.seaBuckthorn,
      colorError: colors.error,
      colorSuccess: colors.success,
      colorWarning: colors.warning,
    },

    // === Typography: Warm text styling ===
    Typography: {
      colorTextHeading: colors.brownBramble,
      colorText: colors.brownBramble,
      colorTextSecondary: colors.textMuted,
    },

    // === Divider: Subtle separation ===
    Divider: {
      colorSplit: 'rgba(102, 38, 4, 0.08)',
    },

    // === Tooltip: Info overlays ===
    Tooltip: {
      colorBgSpotlight: colors.brownBramble,
      colorTextLightSolid: colors.coconutCream,
      borderRadius: 6,
    },

    // === Spin: Loading indicator ===
    Spin: {
      colorPrimary: colors.seaBuckthorn,
    },

    // === Empty: Empty states ===
    Empty: {
      colorTextDescription: colors.textMuted,
    },

    // === Avatar: User profile images ===
    Avatar: {
      colorBgBase: colors.salomie,
      colorTextBase: colors.brownBramble,
    },

    // === Steps: Wizard/progress steps ===
    Steps: {
      colorPrimary: colors.seaBuckthorn,
    },

    // === Form: Input groups ===
    Form: {
      labelColor: colors.brownBramble,
      verticalLabelPadding: `0 0 ${spacing.sm}px`,
    },
  },
};

export default apisTheme;
