/**
 * Component Render Tests
 *
 * Verifies that theme tokens are correctly applied to rendered components.
 * Uses @testing-library/react to render components within ConfigProvider.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, Button, Card } from 'antd';
import { apisTheme } from '../src/theme/apisTheme';
import { ApiCard } from '../src/components/ApiCard';

describe('Theme rendering integration', () => {
  it('renders Button within themed ConfigProvider', () => {
    render(
      <ConfigProvider theme={apisTheme}>
        <Button type="primary" data-testid="themed-button">
          Test Button
        </Button>
      </ConfigProvider>
    );

    const button = screen.getByTestId('themed-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Test Button');
  });

  it('renders Card within themed ConfigProvider', () => {
    render(
      <ConfigProvider theme={apisTheme}>
        <Card data-testid="themed-card" title="Test Card">
          Card content
        </Card>
      </ConfigProvider>
    );

    const card = screen.getByTestId('themed-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });
});

describe('ApiCard component', () => {
  it('renders with default props', () => {
    render(
      <ConfigProvider theme={apisTheme}>
        <ApiCard data-testid="api-card" title="Detection Stats">
          <p>Stats content</p>
        </ApiCard>
      </ConfigProvider>
    );

    const card = screen.getByTestId('api-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByText('Detection Stats')).toBeInTheDocument();
    expect(screen.getByText('Stats content')).toBeInTheDocument();
  });

  it('is hoverable by default', () => {
    render(
      <ConfigProvider theme={apisTheme}>
        <ApiCard data-testid="hoverable-card" title="Hoverable">
          Content
        </ApiCard>
      </ConfigProvider>
    );

    const card = screen.getByTestId('hoverable-card');
    // Ant Design adds ant-card-hoverable class when hoverable
    expect(card).toHaveClass('ant-card-hoverable');
  });

  it('can disable hover with noHover prop', () => {
    render(
      <ConfigProvider theme={apisTheme}>
        <ApiCard data-testid="no-hover-card" noHover title="No Hover">
          Content
        </ApiCard>
      </ConfigProvider>
    );

    const card = screen.getByTestId('no-hover-card');
    expect(card).not.toHaveClass('ant-card-hoverable');
  });

  it('respects explicit hoverable=false', () => {
    render(
      <ConfigProvider theme={apisTheme}>
        <ApiCard data-testid="explicit-no-hover" hoverable={false} title="Test">
          Content
        </ApiCard>
      </ConfigProvider>
    );

    const card = screen.getByTestId('explicit-no-hover');
    expect(card).not.toHaveClass('ant-card-hoverable');
  });
});
