/**
 * MilestonesGallery Component
 *
 * Displays a grid of milestone photos with viewing and deletion capabilities.
 * Accessible from the Settings page.
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration - AC#5
 */
import { useState } from 'react';
import { Card, Row, Col, Image, Empty, Spin, Modal, Button, Typography, Badge, Popconfirm, message } from 'antd';
import { DeleteOutlined, TrophyOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import { useMilestonePhotos, getMilestoneTypeName } from '../hooks/useMilestones';
import type { MilestonePhoto } from '../hooks/useMilestones';

const { Text } = Typography;

/**
 * Get badge color for milestone type
 */
function getMilestoneBadgeColor(type: string): string {
  switch (type) {
    case 'first_harvest':
      return colors.seaBuckthorn;
    case 'first_hive_harvest':
      return colors.success;
    default:
      return colors.info;
  }
}

/**
 * Single milestone photo card
 */
interface MilestoneCardProps {
  photo: MilestonePhoto;
  onView: (photo: MilestonePhoto) => void;
  onDelete: (id: string) => Promise<void>;
}

function MilestoneCard({ photo, onView, onDelete }: MilestoneCardProps) {
  const [cardDeleting, setCardDeleting] = useState(false);
  const thumbnailUrl = photo.thumbnail_path || photo.file_path;

  const handleDelete = async () => {
    setCardDeleting(true);
    try {
      await onDelete(photo.id);
    } finally {
      setCardDeleting(false);
    }
  };

  return (
    <Card
      hoverable
      style={{
        overflow: 'hidden',
        background: colors.salomie,
      }}
      styles={{
        body: { padding: 12 },
      }}
      cover={
        <div
          style={{
            position: 'relative',
            height: 160,
            background: `url(${thumbnailUrl}) center/cover no-repeat`,
            backgroundColor: colors.coconutCream,
          }}
        >
          <Badge.Ribbon
            text={getMilestoneTypeName(photo.milestone_type)}
            color={getMilestoneBadgeColor(photo.milestone_type)}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '24px 8px 8px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onView(photo)}
              style={{ background: colors.seaBuckthorn, borderColor: colors.seaBuckthorn }}
            >
              View
            </Button>
            <Popconfirm
              title="Delete this milestone photo?"
              description="This action cannot be undone."
              onConfirm={handleDelete}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                icon={<DeleteOutlined />}
                loading={cardDeleting}
                danger
              >
                Delete
              </Button>
            </Popconfirm>
          </div>
        </div>
      }
    >
      <div>
        {photo.caption && (
          <Text
            style={{
              display: 'block',
              marginBottom: 4,
              color: colors.brownBramble,
              fontWeight: 500,
            }}
            ellipsis={{ tooltip: photo.caption }}
          >
            {photo.caption}
          </Text>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(photo.created_at).format('MMMM D, YYYY')}
        </Text>
      </div>
    </Card>
  );
}

/**
 * MilestonesGallery Component
 *
 * Displays all milestone photos in a responsive grid.
 * Includes viewing photos in full size and deletion with confirmation.
 *
 * @example
 * // In Settings page:
 * <Card title="Milestones">
 *   <MilestonesGallery />
 * </Card>
 */
export function MilestonesGallery() {
  const { photos, loading, deletePhoto } = useMilestonePhotos();
  const [viewingPhoto, setViewingPhoto] = useState<MilestonePhoto | null>(null);

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deletePhoto(id);
      message.success('Milestone photo deleted');
    } catch (error) {
      message.error('Failed to delete photo');
      throw error;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Loading milestones...</Text>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <Empty
        image={
          <TrophyOutlined
            style={{
              fontSize: 64,
              color: colors.seaBuckthorn,
              opacity: 0.5,
            }}
          />
        }
        description={
          <div>
            <Text type="secondary">No milestone photos yet</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Photos from your first harvest and other milestones will appear here
            </Text>
          </div>
        }
      />
    );
  }

  return (
    <>
      <Row gutter={[16, 16]}>
        {photos.map((photo) => (
          <Col key={photo.id} xs={24} sm={12} md={8} lg={6}>
            <MilestoneCard
              photo={photo}
              onView={setViewingPhoto}
              onDelete={handleDelete}
            />
          </Col>
        ))}
      </Row>

      {/* Full-size photo viewer modal */}
      <Modal
        open={!!viewingPhoto}
        onCancel={() => setViewingPhoto(null)}
        footer={null}
        width={800}
        centered
        styles={{
          body: { padding: 0 },
        }}
      >
        {viewingPhoto && (
          <div>
            <Image
              src={viewingPhoto.file_path}
              alt={viewingPhoto.caption || 'Milestone photo'}
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              preview={false}
            />
            <div style={{ padding: 16 }}>
              <Badge
                color={getMilestoneBadgeColor(viewingPhoto.milestone_type)}
                text={
                  <Text strong style={{ color: colors.brownBramble }}>
                    {getMilestoneTypeName(viewingPhoto.milestone_type)}
                  </Text>
                }
              />
              {viewingPhoto.caption && (
                <div style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.brownBramble }}>{viewingPhoto.caption}</Text>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  {dayjs(viewingPhoto.created_at).format('dddd, MMMM D, YYYY')}
                </Text>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default MilestonesGallery;
