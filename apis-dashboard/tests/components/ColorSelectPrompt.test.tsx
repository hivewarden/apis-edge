/**
 * Tests for ColorSelectPrompt component
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { ColorSelectPrompt } from '../../src/components/ColorSelectPrompt';
import { apisTheme, touchTargets } from '../../src/theme/apisTheme';

const colorOptions = [
  { value: 'white', label: 'White' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'unmarked', label: 'Unmarked' },
];

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

describe('ColorSelectPrompt', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all color options', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByTestId('color-option-white')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-yellow')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-red')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-green')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-blue')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-unmarked')).toBeInTheDocument();
  });

  it('shows selected option with highlighted styling', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value="yellow"
        onChange={mockOnChange}
      />
    );

    const yellowButton = screen.getByTestId('color-option-yellow');
    expect(yellowButton).toHaveAttribute('aria-pressed', 'true');

    const whiteButton = screen.getByTestId('color-option-white');
    expect(whiteButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when clicking an option', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    fireEvent.click(screen.getByTestId('color-option-blue'));

    expect(mockOnChange).toHaveBeenCalledWith('blue');
  });

  it('renders buttons with 64px height touch targets', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    const button = screen.getByTestId('color-option-white');
    expect(button).toHaveStyle({ height: `${touchTargets.mobile}px` });
  });

  it('shows asterisk for required fields', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
        required
      />
    );

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not show asterisk for optional fields', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
        required={false}
      />
    );

    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders label text', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Queen marking color')).toBeInTheDocument();
  });

  it('displays option labels correctly', () => {
    renderWithTheme(
      <ColorSelectPrompt
        label="Queen marking color"
        options={colorOptions}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('White')).toBeInTheDocument();
    expect(screen.getByText('Yellow')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Unmarked')).toBeInTheDocument();
  });
});
