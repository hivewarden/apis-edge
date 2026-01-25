/**
 * Tests for QRCodeGenerator component
 *
 * @module tests/components/QRCodeGenerator.test
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { generateQRContent } from '../../src/components/QRCodeGenerator';

// Note: QRCodeGenerator relies on QRCode.toCanvas which requires a real canvas context.
// The canvas ref initialization and async state updates make it challenging to test
// the full rendering flow in a unit test. The utility function and basic structure
// are tested here. Full integration tests would be done via E2E testing.

describe('QRCodeGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateQRContent', () => {
    it('should generate correct APIS URL format', () => {
      const result = generateQRContent('site-123', 'hive-456');

      expect(result).toBe('apis://hive/site-123/hive-456');
    });

    it('should handle special characters in IDs', () => {
      const result = generateQRContent('site_abc-123', 'hive_xyz-789');

      expect(result).toBe('apis://hive/site_abc-123/hive_xyz-789');
    });

    it('should handle UUID-style IDs', () => {
      const result = generateQRContent(
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      );

      expect(result).toBe(
        'apis://hive/550e8400-e29b-41d4-a716-446655440000/6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      );
    });

    it('should handle simple numeric IDs', () => {
      const result = generateQRContent('1', '42');

      expect(result).toBe('apis://hive/1/42');
    });

    it('should handle empty strings gracefully', () => {
      const result = generateQRContent('', '');

      expect(result).toBe('apis://hive//');
    });

    it('should preserve alphanumeric characters in IDs', () => {
      const result = generateQRContent('ABC123', 'xyz789');

      expect(result).toBe('apis://hive/ABC123/xyz789');
    });
  });

  describe('component structure', () => {
    it('should export the component and utility function', async () => {
      const module = await import('../../src/components/QRCodeGenerator');

      expect(typeof module.QRCodeGenerator).toBe('function');
      expect(typeof module.generateQRContent).toBe('function');
    });

    it('should export default as QRCodeGenerator', async () => {
      const module = await import('../../src/components/QRCodeGenerator');

      expect(module.default).toBe(module.QRCodeGenerator);
    });
  });
});
