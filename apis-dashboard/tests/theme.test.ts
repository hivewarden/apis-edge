/**
 * Theme Configuration Tests
 *
 * Verifies that apisTheme meets acceptance criteria:
 * - AC1: Primary theme colors applied correctly
 * - AC2: ConfigProvider tokens match specification
 * - AC3: Card component tokens configured correctly
 */

import { describe, it, expect } from 'vitest';
import { apisTheme, colors } from '../src/theme/apisTheme';

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
