/**
 * Tests for AutoEffectPrompts component
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { AutoEffectPrompts } from '../../src/components/AutoEffectPrompts';
import { Prompt } from '../../src/hooks/useTasks';
import { apisTheme } from '../../src/theme/apisTheme';

const selectPrompt: Prompt = {
  key: 'color',
  label: 'Queen marking color',
  type: 'select',
  options: [
    { value: 'white', label: 'White' },
    { value: 'yellow', label: 'Yellow' },
  ],
  required: true,
};

const numberPrompt: Prompt = {
  key: 'count',
  label: 'Super count',
  type: 'number',
  required: false,
};

const textPrompt: Prompt = {
  key: 'notes',
  label: 'Notes',
  type: 'text',
  required: true,
};

const genericSelectPrompt: Prompt = {
  key: 'treatment_type',
  label: 'Treatment Type',
  type: 'select',
  options: [
    { value: 'oxalic', label: 'Oxalic Acid' },
    { value: 'formic', label: 'Formic Acid' },
  ],
  required: false,
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

describe('AutoEffectPrompts', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders select prompt as color buttons when key contains "color"', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[selectPrompt]}
        values={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Queen marking color')).toBeInTheDocument();
    expect(screen.getByTestId('color-select-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-white')).toBeInTheDocument();
    expect(screen.getByTestId('color-option-yellow')).toBeInTheDocument();
  });

  it('renders generic select prompt as SelectPrompt for non-color options', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[genericSelectPrompt]}
        values={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Treatment Type')).toBeInTheDocument();
    expect(screen.getByTestId('select-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('select-option-oxalic')).toBeInTheDocument();
    expect(screen.getByTestId('select-option-formic')).toBeInTheDocument();
  });

  it('renders number prompt with +/- buttons', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[numberPrompt]}
        values={{ count: 0 }}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Super count')).toBeInTheDocument();
    expect(screen.getByTestId('number-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('increment-button')).toBeInTheDocument();
    expect(screen.getByTestId('decrement-button')).toBeInTheDocument();
  });

  it('renders text prompt as textarea', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[textPrompt]}
        values={{ notes: '' }}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByTestId('text-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
  });

  it('shows asterisk for required prompts', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[selectPrompt, textPrompt]}
        values={{}}
        onChange={mockOnChange}
      />
    );

    // Both are required, should have asterisks
    const asterisks = document.querySelectorAll('span[style*="color"]');
    expect(asterisks.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onChange with correct key and value when select prompt changes', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[selectPrompt]}
        values={{}}
        onChange={mockOnChange}
      />
    );

    fireEvent.click(screen.getByTestId('color-option-yellow'));

    expect(mockOnChange).toHaveBeenCalledWith('color', 'yellow');
  });

  it('calls onChange with correct key and value when number prompt changes', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[numberPrompt]}
        values={{ count: 0 }}
        onChange={mockOnChange}
      />
    );

    fireEvent.click(screen.getByTestId('increment-button'));

    expect(mockOnChange).toHaveBeenCalledWith('count', 1);
  });

  it('calls onChange with correct key and value when text prompt changes', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[textPrompt]}
        values={{ notes: '' }}
        onChange={mockOnChange}
      />
    );

    const textarea = screen.getByTestId('text-input');
    fireEvent.change(textarea, { target: { value: 'Test note' } });

    expect(mockOnChange).toHaveBeenCalledWith('notes', 'Test note');
  });

  it('renders multiple prompts in order', () => {
    renderWithTheme(
      <AutoEffectPrompts
        prompts={[selectPrompt, numberPrompt, textPrompt]}
        values={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Queen marking color')).toBeInTheDocument();
    expect(screen.getByText('Super count')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });
});
