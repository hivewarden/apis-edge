/**
 * CustomLabels Page
 *
 * Settings page for managing custom labels (user-defined categories for
 * feeds, treatments, equipment, and issues).
 *
 * Part of Epic 6, Story 6.5 (Custom Labels System)
 */
import { useState } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Tag,
  Divider,
  Spin,
  Empty,
  notification,
  Tooltip,
} from 'antd';
import {
  TagsOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { colors } from '../theme/apisTheme';
import {
  useCustomLabels,
  LABEL_CATEGORIES,
  getBuiltInTypes,
  type LabelCategory,
  type CustomLabel,
} from '../hooks/useCustomLabels';
import { LabelFormModal } from '../components/LabelFormModal';
import { LabelDeleteModal } from '../components/LabelDeleteModal';

const { Title } = Typography;

/**
 * Custom Labels Settings Page
 *
 * Displays categories (Feed Types, Treatment Types, Equipment Types, Issue Types)
 * each with built-in items (greyed out, non-editable) and custom items (editable).
 */
export function CustomLabels() {
  const {
    labelsByCategory,
    loading,
    createLabel,
    updateLabel,
    deleteLabel,
    getLabelUsage,
    creating,
    updating,
    deleting,
  } = useCustomLabels();

  // Modal state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<LabelCategory | null>(null);
  const [editingLabel, setEditingLabel] = useState<CustomLabel | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<CustomLabel | null>(null);

  // Open add modal for a category
  const handleAdd = (category: LabelCategory) => {
    setActiveCategory(category);
    setEditingLabel(null);
    setFormModalOpen(true);
  };

  // Open edit modal for a label
  const handleEdit = (label: CustomLabel) => {
    setActiveCategory(label.category);
    setEditingLabel(label);
    setFormModalOpen(true);
  };

  // Open delete confirmation modal
  const handleDeleteClick = (label: CustomLabel) => {
    setDeletingLabel(label);
    setDeleteModalOpen(true);
  };

  // Handle form submit (create or update)
  const handleFormSubmit = async (name: string) => {
    try {
      if (editingLabel) {
        await updateLabel(editingLabel.id, { name });
        notification.success({
          message: 'Label Updated',
          description: `"${name}" has been updated.`,
        });
      } else if (activeCategory) {
        await createLabel({ category: activeCategory, name });
        notification.success({
          message: 'Label Created',
          description: `"${name}" has been added to ${LABEL_CATEGORIES.find(c => c.value === activeCategory)?.label}.`,
        });
      }
      setFormModalOpen(false);
    } catch (err) {
      const error = err as Error & { response?: { data?: { error?: string } } };
      const message = error.response?.data?.error || error.message || 'An error occurred';
      notification.error({
        message: editingLabel ? 'Update Failed' : 'Create Failed',
        description: message,
      });
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deletingLabel) return;

    try {
      await deleteLabel(deletingLabel.id);
      notification.success({
        message: 'Label Deleted',
        description: `"${deletingLabel.name}" has been deleted.`,
      });
      setDeleteModalOpen(false);
      setDeletingLabel(null);
    } catch (err) {
      const error = err as Error & { response?: { data?: { error?: string } } };
      const message = error.response?.data?.error || error.message || 'An error occurred';
      notification.error({
        message: 'Delete Failed',
        description: message,
      });
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 800, textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header with back link */}
      <Space style={{ marginBottom: 24 }}>
        <Link to="/settings">
          <Button type="text" icon={<ArrowLeftOutlined />} />
        </Link>
        <TagsOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
        <Title level={2} style={{ margin: 0 }}>Custom Labels</Title>
      </Space>

      {/* Category Cards */}
      {LABEL_CATEGORIES.map(category => {
        const builtInTypes = getBuiltInTypes(category.value);
        const customLabels = labelsByCategory[category.value] || [];

        return (
          <Card
            key={category.value}
            title={category.label}
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handleAdd(category.value)}
              >
                Add
              </Button>
            }
            style={{ marginBottom: 16 }}
          >
            {/* Built-in items (greyed out, non-editable) */}
            <div style={{ marginBottom: builtInTypes.length > 0 && customLabels.length > 0 ? 0 : 8 }}>
              {builtInTypes.map(type => (
                <Tooltip key={type.value} title="Built-in (cannot be edited)">
                  <Tag
                    style={{
                      marginBottom: 8,
                      marginRight: 8,
                      backgroundColor: '#f5f5f5',
                      color: 'rgba(0, 0, 0, 0.45)',
                      border: '1px solid #d9d9d9',
                    }}
                  >
                    {type.label}
                  </Tag>
                </Tooltip>
              ))}
            </div>

            {/* Divider between built-in and custom */}
            {builtInTypes.length > 0 && customLabels.length > 0 && (
              <Divider dashed style={{ margin: '12px 0' }} />
            )}

            {/* Custom items (editable) */}
            {customLabels.length > 0 ? (
              <div>
                {customLabels.map(label => (
                  <Tag
                    key={label.id}
                    style={{
                      marginBottom: 8,
                      marginRight: 8,
                      backgroundColor: `${colors.seaBuckthorn}15`,
                      borderColor: colors.seaBuckthorn,
                    }}
                  >
                    {label.name}
                    <EditOutlined
                      style={{
                        marginLeft: 8,
                        cursor: 'pointer',
                        color: colors.seaBuckthorn,
                      }}
                      onClick={() => handleEdit(label)}
                    />
                    <DeleteOutlined
                      style={{
                        marginLeft: 4,
                        cursor: 'pointer',
                        color: colors.error,
                      }}
                      onClick={() => handleDeleteClick(label)}
                    />
                  </Tag>
                ))}
              </div>
            ) : builtInTypes.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No labels yet"
              />
            ) : null}
          </Card>
        );
      })}

      {/* Form Modal */}
      <LabelFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        loading={creating || updating}
        category={activeCategory || undefined}
        editingLabel={editingLabel}
      />

      {/* Delete Confirmation Modal */}
      <LabelDeleteModal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeletingLabel(null);
        }}
        onConfirm={handleDeleteConfirm}
        label={deletingLabel}
        getLabelUsage={getLabelUsage}
        loading={deleting}
      />
    </div>
  );
}

export default CustomLabels;
