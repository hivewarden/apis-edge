/**
 * TaskLibrarySection Component
 *
 * Displays a grid of task template cards for the Tasks page.
 * System templates are shown first, followed by custom templates.
 * Includes a "+ Create Custom" card to add new templates.
 *
 * Part of Epic 14, Story 14.4 (Portal Tasks Screen)
 * Updated to match v2 mockups (apis_tasks_overview)
 */
import { Row, Col, Typography, Empty, Spin } from 'antd';
import {
  PlusOutlined,
  BugOutlined,
  PlusSquareOutlined,
  CrownOutlined,
  ExperimentOutlined,
  ToolOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { TaskTemplate } from '../hooks/useTaskTemplates';
import { colors } from '../theme/apisTheme';

const { Text, Paragraph } = Typography;

/**
 * Map template types to their Material icon names (for display).
 */
const templateIcons: Record<string, React.ReactNode> = {
  treatment: <BugOutlined style={{ fontSize: 24 }} />,
  add_frame: <PlusSquareOutlined style={{ fontSize: 24 }} />,
  add_honey_super: <PlusSquareOutlined style={{ fontSize: 24 }} />,
  add_brood_box: <PlusSquareOutlined style={{ fontSize: 24 }} />,
  requeen: <CrownOutlined style={{ fontSize: 24 }} />,
  harvest_frames: <ExperimentOutlined style={{ fontSize: 24 }} />,
  custom: <ToolOutlined style={{ fontSize: 24 }} />,
};

/**
 * Map template types to category labels for badges.
 */
const templateCategories: Record<string, string> = {
  treatment: 'Standard',
  add_frame: 'Expansion',
  add_honey_super: 'Expansion',
  add_brood_box: 'Expansion',
  requeen: 'Critical',
  harvest_frames: 'Harvest',
  custom: 'Custom',
};

/**
 * Get icon for a template type.
 */
function getTemplateIcon(type: string): React.ReactNode {
  return templateIcons[type] || <AppstoreOutlined style={{ fontSize: 24 }} />;
}

/**
 * Get category label for a template type.
 */
function getTemplateCategory(type: string, isSystem: boolean): string {
  if (!isSystem) return 'Custom';
  return templateCategories[type] || 'Standard';
}

export interface TaskLibrarySectionProps {
  /** List of task templates to display */
  templates: TaskTemplate[];
  /** Loading state */
  loading?: boolean;
  /** Callback when "+ Create Custom" is clicked */
  onCreateClick: () => void;
  /** Callback when a template card is clicked */
  onTemplateClick?: (template: TaskTemplate) => void;
  /** Callback when "View all templates" is clicked */
  onViewAllClick?: () => void;
}

/**
 * TaskLibrarySection Component
 *
 * Renders a responsive grid of template cards matching v2 mockup design.
 * Cards have left border accent, icon with hover effect, and category badge.
 */
export function TaskLibrarySection({
  templates,
  loading = false,
  onCreateClick,
  onTemplateClick,
  onViewAllClick,
}: TaskLibrarySectionProps) {
  // Sort templates: system first, then custom by created_at DESC
  const sortedTemplates = [...templates].sort((a, b) => {
    // System templates come first
    if (a.is_system && !b.is_system) return -1;
    if (!a.is_system && b.is_system) return 1;

    // Within same category, sort custom templates by created_at DESC
    if (!a.is_system && !b.is_system) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }

    // System templates maintain their original order (by name)
    return a.name.localeCompare(b.name);
  });

  // Show all templates in the library
  const previewTemplates = sortedTemplates;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large">
          <div style={{ marginTop: 48, color: colors.textMuted }}>Loading templates...</div>
        </Spin>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Empty
        description="No task templates available"
        style={{ padding: 48 }}
      >
        <div
          onClick={onCreateClick}
          style={{
            border: `2px dashed ${colors.seaBuckthorn}`,
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
            cursor: 'pointer',
            width: 200,
            margin: '0 auto',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(247, 164, 45, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <PlusOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
          <div style={{ marginTop: 8 }}>
            <Text strong style={{ color: colors.seaBuckthorn }}>
              Create Custom Template
            </Text>
          </div>
        </div>
      </Empty>
    );
  }

  return (
    <div>
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="material-symbols-outlined"
            style={{ color: colors.seaBuckthorn, fontSize: 20 }}
          >
            library_books
          </span>
          <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>
            Task Library
          </Text>
        </div>
        {onViewAllClick && (
          <Text
            style={{
              color: colors.seaBuckthorn,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
            onClick={onViewAllClick}
          >
            View all templates
          </Text>
        )}
      </div>

      {/* Template Cards Grid */}
      <Row gutter={[16, 16]}>
        {previewTemplates.map((template) => {
          const category = getTemplateCategory(template.type, template.is_system);
          return (
            <Col key={template.id} xs={24} sm={12} md={12} lg={6}>
              <div
                onClick={() => onTemplateClick?.(template)}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: 20,
                  borderLeft: `4px solid ${colors.seaBuckthorn}`,
                  boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  height: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(247, 162, 43, 0.15)';
                  // Find and update the icon container
                  const iconContainer = e.currentTarget.querySelector('[data-icon-container]') as HTMLElement;
                  if (iconContainer) {
                    iconContainer.style.backgroundColor = colors.seaBuckthorn;
                    iconContainer.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(102, 38, 4, 0.08)';
                  // Reset icon container
                  const iconContainer = e.currentTarget.querySelector('[data-icon-container]') as HTMLElement;
                  if (iconContainer) {
                    iconContainer.style.backgroundColor = 'rgba(247, 164, 45, 0.1)';
                    iconContainer.style.color = colors.seaBuckthorn;
                  }
                }}
              >
                {/* Top row: Icon and Category badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div
                    data-icon-container
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      backgroundColor: 'rgba(247, 164, 45, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: colors.seaBuckthorn,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {getTemplateIcon(template.type)}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#8c7e72',
                      backgroundColor: '#f8f7f5',
                      padding: '4px 8px',
                      borderRadius: 9999,
                    }}
                  >
                    {category}
                  </span>
                </div>

                {/* Template name */}
                <Text
                  strong
                  style={{
                    display: 'block',
                    fontSize: 15,
                    color: colors.brownBramble,
                    marginBottom: 4,
                  }}
                >
                  {template.name}
                </Text>

                {/* Description */}
                {template.description && (
                  <Paragraph
                    style={{
                      fontSize: 13,
                      color: '#8c7e72',
                      marginBottom: 0,
                      lineHeight: 1.5,
                    }}
                    ellipsis={{ rows: 2 }}
                  >
                    {template.description}
                  </Paragraph>
                )}
              </div>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}

export default TaskLibrarySection;
