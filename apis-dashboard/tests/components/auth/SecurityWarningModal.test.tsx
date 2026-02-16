/**
 * Tests for SecurityWarningModal Component
 *
 * Tests the security warning modal displayed when user selects
 * "Remote access" deployment scenario during setup.
 *
 * Part of Story 13-7: Setup Wizard
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../../src/theme/apisTheme';
import { SecurityWarningModal } from '../../../src/components/auth/SecurityWarningModal';

const renderModal = (props: {
  open: boolean;
  onAcknowledge?: () => void;
  onCancel?: () => void;
}) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      <SecurityWarningModal
        open={props.open}
        onAcknowledge={props.onAcknowledge || vi.fn()}
        onCancel={props.onCancel || vi.fn()}
      />
    </ConfigProvider>
  );
};

describe('SecurityWarningModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders modal when open is true', () => {
      renderModal({ open: true });
      expect(screen.getByText('Security Considerations')).toBeInTheDocument();
    });

    it('does not render modal content when open is false', () => {
      renderModal({ open: false });
      expect(screen.queryByText('Security Considerations')).not.toBeInTheDocument();
    });

    it('renders warning alert about remote access', () => {
      renderModal({ open: true });
      expect(screen.getByText('Remote Access Enabled')).toBeInTheDocument();
      expect(screen.getByText(/accessible over the internet/i)).toBeInTheDocument();
    });

    it('renders security recommendations section', () => {
      renderModal({ open: true });
      expect(screen.getByText('Important Security Recommendations')).toBeInTheDocument();
    });

    it('renders HTTPS recommendation', () => {
      renderModal({ open: true });
      expect(screen.getByText('Use HTTPS')).toBeInTheDocument();
      expect(screen.getByText(/valid SSL certificate/i)).toBeInTheDocument();
    });

    it('renders strong password recommendation', () => {
      renderModal({ open: true });
      expect(screen.getByText('Strong Password')).toBeInTheDocument();
      expect(screen.getByText(/password manager/i)).toBeInTheDocument();
    });

    it('renders firewall/VPN recommendation', () => {
      renderModal({ open: true });
      expect(screen.getByText('Firewall & VPN')).toBeInTheDocument();
      expect(screen.getByText(/restricting access/i)).toBeInTheDocument();
    });

    it('renders acknowledgment disclaimer', () => {
      renderModal({ open: true });
      expect(screen.getByText(/you acknowledge that you are responsible/i)).toBeInTheDocument();
    });

    it('renders Go Back button', () => {
      renderModal({ open: true });
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    });

    it('renders I Understand button', () => {
      renderModal({ open: true });
      expect(screen.getByRole('button', { name: /i understand/i })).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onAcknowledge when I Understand button is clicked', async () => {
      const user = userEvent.setup();
      const onAcknowledge = vi.fn();
      renderModal({ open: true, onAcknowledge });

      const acknowledgeButton = screen.getByRole('button', { name: /i understand/i });
      await user.click(acknowledgeButton);

      expect(onAcknowledge).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Go Back button is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderModal({ open: true, onCancel });

      const goBackButton = screen.getByRole('button', { name: /go back/i });
      await user.click(goBackButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when modal close button (X) is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderModal({ open: true, onCancel });

      // Modal close button has aria-label="Close"
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('modal has proper role', () => {
      renderModal({ open: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('buttons have accessible names', () => {
      renderModal({ open: true });
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /i understand/i })).toBeInTheDocument();
    });
  });
});
