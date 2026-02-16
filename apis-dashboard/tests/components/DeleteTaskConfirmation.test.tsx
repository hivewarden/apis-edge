/**
 * Tests for DeleteTaskConfirmation component
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { DeleteTaskConfirmation } from '../../src/components/DeleteTaskConfirmation';
import { apisTheme } from '../../src/theme/apisTheme';

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

describe('DeleteTaskConfirmation', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows task name in confirmation dialog', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={true}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={false}
      />
    );

    expect(screen.getByTestId('task-name')).toHaveTextContent('Requeen Hive A');
  });

  it('shows "Delete this task?" title', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={true}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={false}
      />
    );

    expect(screen.getByTestId('delete-title')).toHaveTextContent('Delete this task?');
  });

  it('calls onConfirm when Delete button is clicked', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={true}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={false}
      />
    );

    const deleteButton = screen.getByTestId('delete-button');
    fireEvent.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel button is clicked', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={true}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={false}
      />
    );

    const cancelButton = screen.getByTestId('cancel-button');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows loading state on Delete button when deleting', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={true}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={true}
      />
    );

    const deleteButton = screen.getByTestId('delete-button');
    // Ant Design Button with loading shows a spinner
    expect(deleteButton.querySelector('.ant-btn-loading-icon')).toBeInTheDocument();
  });

  it('disables Cancel button when deleting', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={true}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={true}
      />
    );

    const cancelButton = screen.getByTestId('cancel-button');
    expect(cancelButton).toBeDisabled();
  });

  it('does not render when visible is false', () => {
    renderWithTheme(
      <DeleteTaskConfirmation
        visible={false}
        taskName="Requeen Hive A"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        deleting={false}
      />
    );

    expect(screen.queryByTestId('delete-task-confirmation')).not.toBeInTheDocument();
  });
});
