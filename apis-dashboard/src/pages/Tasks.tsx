/**
 * Tasks Page
 *
 * Main page for task management featuring:
 * - Page header with "Operations Management" breadcrumb
 * - Task Library section with template cards
 * - Two-column layout: Quick Assign (left) + Active Schedule (right)
 * - Create Template modal for custom templates
 *
 * Part of Epic 14, Stories 14.4, 14.5, and 14.14
 * Updated to match v2 mockups (apis_tasks_overview)
 */
import { useState, useRef } from 'react';
import {
  Typography,
  Card,
  Alert,
  Skeleton,
  Input,
  Badge,
  Row,
  Col,
} from 'antd';
import { BellOutlined, SearchOutlined } from '@ant-design/icons';
import {
  TaskLibrarySection,
  CreateTemplateModal,
  TaskAssignmentSection,
  ActiveTasksList,
  ErrorBoundary,
} from '../components';
import { useTaskTemplates } from '../hooks';
import type { TaskTemplate } from '../hooks';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;

/**
 * Tasks page component.
 *
 * Displays task templates in a library grid and provides
 * a form for assigning tasks to multiple hives.
 */
export function Tasks() {
  // Fetch task templates
  const { templates, loading, error, refetch } = useTaskTemplates();

  // S5-L2: Removed unused useTaskStats() hook call that triggered unnecessary API request.
  // TODO: Re-add useTaskStats() when overdue alert banner (Story 14.14) is connected to this data.

  // Ref for scrolling to overdue section
  const overdueRef = useRef<HTMLDivElement>(null);

  // Trigger for ActiveTasksList to refetch after task creation
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Selected template (for Quick Assign form)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Handle opening create modal
  const handleCreateClick = () => {
    setCreateModalOpen(true);
  };

  // Handle closing create modal
  const handleCreateClose = () => {
    setCreateModalOpen(false);
  };

  // Handle successful template creation
  const handleCreateSuccess = (_template: TaskTemplate) => {
    // Refetch templates to show the new one
    refetch();
  };

  // Handle template card click - selects it in the Quick Assign form
  const handleTemplateClick = (template: TaskTemplate) => {
    setSelectedTemplateId(template.id);
  };

  // Render loading state
  if (loading) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Skeleton.Input active style={{ width: 150, height: 32 }} />
        </div>
        <Card title={<Skeleton.Input active style={{ width: 120 }} />} style={{ marginBottom: 24 }}>
          <Skeleton active paragraph={{ rows: 3 }} />
        </Card>
        <Card title={<Skeleton.Input active style={{ width: 120 }} />}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>
            Tasks
          </Title>
        </div>
        <Alert
          message="Failed to Load Templates"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 32,
          paddingBottom: 0,
        }}
      >
        <div>
          <Text
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#8c7e72',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Operations Management
          </Text>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              color: colors.brownBramble,
              letterSpacing: '-0.02em',
            }}
          >
            Tasks Overview
          </Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Input
            placeholder="Search tasks..."
            prefix={<SearchOutlined style={{ color: '#8c7e72' }} />}
            style={{
              width: 256,
              borderRadius: 9999,
              backgroundColor: '#ffffff',
              border: '1px solid #e6e0d6',
            }}
          />
          <Badge dot offset={[-4, 4]}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 9999,
                backgroundColor: '#ffffff',
                border: '1px solid #e6e0d6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <BellOutlined style={{ fontSize: 18, color: '#8c7e72' }} />
            </div>
          </Badge>
        </div>
      </div>

      {/* Task Library Section */}
      <div style={{ marginBottom: 32 }}>
        <TaskLibrarySection
          templates={templates}
          loading={loading}
          onCreateClick={handleCreateClick}
          onTemplateClick={handleTemplateClick}
          onViewAllClick={handleCreateClick}
        />
      </div>

      {/* Two-column layout: Quick Assign + Active Schedule */}
      <Row gutter={32}>
        {/* Quick Assign Panel (left - 1/3 width) */}
        <Col xs={24} lg={8}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span
                className="material-symbols-outlined"
                style={{ color: colors.seaBuckthorn, fontSize: 20 }}
              >
                assignment_add
              </span>
              <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>
                Quick Assign
              </Text>
            </div>
            <Card
              style={{
                borderRadius: 16,
                border: '1px solid #e6e0d6',
                boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
              }}
              styles={{ body: { padding: 24 } }}
            >
              <TaskAssignmentSection templates={templates} selectedTemplateId={selectedTemplateId ?? undefined} onTasksCreated={() => setRefreshTrigger(n => n + 1)} />
            </Card>
          </div>
        </Col>

        {/* Active Schedule Panel (right - 2/3 width) */}
        <Col xs={24} lg={16}>
          <div ref={overdueRef} id="overdue-tasks">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ color: colors.seaBuckthorn, fontSize: 20 }}
                >
                  pending_actions
                </span>
                <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>
                  Active Schedule
                </Text>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    borderRadius: 9999,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e0d6',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#8c7e72',
                    cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>
                  Filter
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    borderRadius: 9999,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e0d6',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#8c7e72',
                    cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sort</span>
                  Sort
                </div>
              </div>
            </div>
            <Card
              style={{
                borderRadius: 16,
                border: '1px solid #e6e0d6',
                boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
              }}
              styles={{ body: { padding: 0 } }}
            >
              <ErrorBoundary>
                <ActiveTasksList refreshTrigger={refreshTrigger} />
              </ErrorBoundary>
            </Card>
          </div>
        </Col>
      </Row>

      {/* Create Template Modal */}
      <CreateTemplateModal
        open={createModalOpen}
        onClose={handleCreateClose}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

export default Tasks;
