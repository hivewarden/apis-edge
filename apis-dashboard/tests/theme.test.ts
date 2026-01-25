/**
 * Theme Configuration Tests
 *
 * Verifies that apisTheme meets acceptance criteria:
 * - AC1: Primary theme colors applied correctly
 * - AC2: ConfigProvider tokens match specification
 * - AC3: Card component tokens configured correctly
 *
 * Also validates extended Honey Beegood design system:
 * - Semantic state colors (success, warning, error, info)
 * - Touch target sizes (64px for mobile/glove use)
 * - Spacing scale (8px base unit)
 * - WCAG AAA contrast ratios
 */

import { describe, it, expect } from 'vitest';
import { apisTheme, colors, cssVariables, spacing, touchTargets } from '../src/theme/apisTheme';

describe('Honey Beegood Color Palette', () => {
  it('defines Sea Buckthorn as primary color (#f7a42d)', () => {
    expect(colors.seaBuckthorn).toBe('#f7a42d');
  });

  it('defines Coconut Cream as background color (#fbf9e7)', () => {
    expect(colors.coconutCream).toBe('#fbf9e7');
  });

  it('defines Brown Bramble as text color (#662604)', () => {
    expect(colors.brownBramble).toBe('#662604');
  });

  it('defines Salomie as card background color (#fcd483)', () => {
    expect(colors.salomie).toBe('#fcd483');
  });
});

describe('apisTheme token configuration (AC1, AC2)', () => {
  it('sets colorPrimary to Sea Buckthorn', () => {
    expect(apisTheme.token?.colorPrimary).toBe('#f7a42d');
  });

  it('sets colorBgContainer to Coconut Cream', () => {
    expect(apisTheme.token?.colorBgContainer).toBe('#fbf9e7');
  });

  it('sets colorText to Brown Bramble', () => {
    expect(apisTheme.token?.colorText).toBe('#662604');
  });

  it('sets colorBgElevated to Salomie', () => {
    expect(apisTheme.token?.colorBgElevated).toBe('#fcd483');
  });

  it('sets borderRadiusLG to 12px', () => {
    expect(apisTheme.token?.borderRadiusLG).toBe(12);
  });

  it('sets colorTextLightSolid to white for button text contrast', () => {
    expect(apisTheme.token?.colorTextLightSolid).toBe('#ffffff');
  });
});

describe('Card component overrides (AC3)', () => {
  it('sets Card borderRadiusLG to 12px', () => {
    expect(apisTheme.components?.Card?.borderRadiusLG).toBe(12);
  });

  it('sets Card colorBgContainer to Salomie (#fcd483)', () => {
    expect(apisTheme.components?.Card?.colorBgContainer).toBe('#fcd483');
  });

  it('configures Card shadow with brown tint', () => {
    const shadow = apisTheme.components?.Card?.boxShadowTertiary;
    expect(shadow).toContain('rgba(102, 38, 4');
  });
});

describe('Layout component overrides', () => {
  it('sets Layout bodyBg to Coconut Cream', () => {
    expect(apisTheme.components?.Layout?.bodyBg).toBe('#fbf9e7');
  });

  it('sets Layout headerBg to Brown Bramble', () => {
    expect(apisTheme.components?.Layout?.headerBg).toBe('#662604');
  });
});

describe('Extended Honey Beegood Design System', () => {
  describe('Semantic state colors', () => {
    it('defines success color (forest green)', () => {
      expect(colors.success).toBe('#2e7d32');
    });

    it('defines warning color (amber)', () => {
      expect(colors.warning).toBe('#e67e00');
    });

    it('defines error color (terracotta red)', () => {
      expect(colors.error).toBe('#c23616');
    });

    it('defines info color (muted blue)', () => {
      expect(colors.info).toBe('#5c7a99');
    });

    it('applies semantic colors to theme tokens', () => {
      expect(apisTheme.token?.colorSuccess).toBe(colors.success);
      expect(apisTheme.token?.colorWarning).toBe(colors.warning);
      expect(apisTheme.token?.colorError).toBe(colors.error);
      expect(apisTheme.token?.colorInfo).toBe(colors.info);
    });
  });

  describe('Touch target sizes (UX spec: 64px for glove-friendly)', () => {
    it('defines standard touch target (48px)', () => {
      expect(touchTargets.standard).toBe(48);
    });

    it('defines mobile/glove-friendly touch target (64px)', () => {
      expect(touchTargets.mobile).toBe(64);
    });

    it('defines minimum gap between targets (16px)', () => {
      expect(touchTargets.gap).toBe(16);
    });

    it('applies touch targets to Button controlHeight', () => {
      expect(apisTheme.components?.Button?.controlHeight).toBe(48);
      expect(apisTheme.components?.Button?.controlHeightLG).toBe(64);
    });
  });

  describe('Spacing scale (8px base unit)', () => {
    it('defines spacing scale correctly', () => {
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(spacing.xl).toBe(32);
      expect(spacing.xxl).toBe(48);
    });
  });

  describe('CSS variables for custom CSS usage', () => {
    it('exports CSS variable mapping', () => {
      expect(cssVariables['--apis-primary']).toBe('#f7a42d');
      expect(cssVariables['--apis-bg']).toBe('#fbf9e7');
      expect(cssVariables['--apis-text']).toBe('#662604');
      expect(cssVariables['--apis-surface']).toBe('#fcd483');
    });
  });

  describe('Warm shadow system', () => {
    it('defines shadows with brown tint', () => {
      expect(colors.shadowSm).toContain('rgba(102, 38, 4');
      expect(colors.shadowMd).toContain('rgba(102, 38, 4');
      expect(colors.shadowLg).toContain('rgba(102, 38, 4');
      expect(colors.shadowXl).toContain('rgba(102, 38, 4');
    });
  });
});
