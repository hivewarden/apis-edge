/**
 * FirstHarvestModal Component
 *
 * Celebration modal displayed when the beekeeper logs their first harvest.
 * Creates an emotional moment marking this milestone achievement.
 * Includes confetti animation and optional photo upload.
 *
 * Part of Epic 6, Story 6.3 (Harvest Tracking) - AC#5
 * Enhanced in Epic 9, Story 9.2 (First Harvest Celebration) - AC#1, AC#2
 */
import { useState } from 'react';
import { Modal, Result, Button, Typography, Upload, message, Space } from 'antd';
import { TrophyOutlined, CameraOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import { ConfettiAnimation } from './ConfettiAnimation';
import { apiClient } from '../providers/apiClient';

const { Text } = Typography;

interface FirstHarvestModalProps {
  open: boolean;
  onClose: () => void;
  /** Total kg harvested */
  amountKg: number;
  /** Number of hives that contributed */
  hiveCount: number;
  /** Harvest date for display */
  harvestDate: string;
  /** Harvest ID for linking photo to harvest (optional) */
  harvestId?: string;
  /** Callback when photo is uploaded */
  onPhotoUploaded?: () => void;
}

/**
 * First Harvest Celebration Modal
 *
 * A warm, celebratory modal that congratulates the beekeeper
 * on logging their first harvest. This creates an emotional
 * moment and encourages continued engagement with the app.
 *
 * Features:
 * - Animated confetti effect using CSS keyframes
 * - Photo upload to commemorate the milestone
 * - Harvest details prominently displayed
 */
export function FirstHarvestModal({
  open,
  onClose,
  amountKg,
  hiveCount,
  harvestDate,
  harvestId,
  onPhotoUploaded,
}: FirstHarvestModalProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const handleUpload = async () => {
    if (fileList.length === 0) return;

    const file = fileList[0];
    if (!file.originFileObj) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file.originFileObj);
      formData.append('milestone_type', 'first_harvest');
      if (harvestId) {
        formData.append('reference_id', harvestId);
      }
      formData.append('caption', `My first harvest - ${amountKg.toFixed(1)} kg!`);

      await apiClient.post('/milestones/photos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      message.success('Photo saved to your milestones!');
      setUploaded(true);
      setFileList([]);
      onPhotoUploaded?.();
    } catch (error) {
      console.error('Failed to upload milestone photo:', error);
      message.error('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const beforeUpload = (file: RcFile) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('You can only upload image files!');
      return false;
    }

    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('Image must be smaller than 5MB!');
      return false;
    }

    return false; // Prevent auto upload
  };

  const handleChange = ({ fileList: newFileList }: { fileList: UploadFile[] }) => {
    setFileList(newFileList.slice(-1)); // Only keep last file
  };

  const handleClose = () => {
    setFileList([]);
    setUploaded(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={480}
      centered
      styles={{
        body: {
          padding: '32px 24px',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 400,
        },
        content: {
          background: `linear-gradient(180deg, ${colors.salomie}22 0%, white 40%)`,
        },
      }}
    >
      {/* Animated Confetti */}
      <ConfettiAnimation active={open} pieceCount={30} duration={3} />

      <Result
        icon={
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${colors.seaBuckthorn} 0%, ${colors.salomie} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: `0 8px 24px ${colors.seaBuckthorn}40`,
            }}
          >
            <TrophyOutlined style={{ fontSize: 40, color: 'white' }} />
          </div>
        }
        title={
          <span style={{ color: colors.brownBramble }}>
            Congratulations on Your First Harvest!
          </span>
        }
        subTitle={
          <div style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 16 }}>
              <strong style={{ color: colors.seaBuckthorn }}>
                {amountKg.toFixed(1)} kg
              </strong>{' '}
              of liquid gold from{' '}
              <strong>
                {hiveCount} hive{hiveCount !== 1 ? 's' : ''}
              </strong>
            </Text>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Harvested on {dayjs(harvestDate).format('dddd, MMMM D, YYYY')}
              </Text>
            </div>
          </div>
        }
        extra={
          <div style={{ marginTop: 16 }}>
            {/* Photo Upload Section */}
            <div
              style={{
                marginBottom: 20,
                padding: '16px',
                background: colors.coconutCream,
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
              }}
            >
              {uploaded ? (
                <Space direction="vertical" align="center" style={{ width: '100%' }}>
                  <CheckCircleOutlined style={{ fontSize: 32, color: colors.success }} />
                  <Text type="secondary">Photo saved to your Milestones!</Text>
                </Space>
              ) : (
                <>
                  <Text style={{ display: 'block', marginBottom: 12, color: colors.brownBramble }}>
                    <CameraOutlined style={{ marginRight: 8 }} />
                    Add a photo to remember this moment
                  </Text>
                  <Upload
                    listType="picture-card"
                    fileList={fileList}
                    beforeUpload={beforeUpload}
                    onChange={handleChange}
                    accept="image/jpeg,image/png,image/webp"
                    maxCount={1}
                  >
                    {fileList.length === 0 && (
                      <div>
                        <CameraOutlined style={{ fontSize: 24, color: colors.textMuted }} />
                        <div style={{ marginTop: 8, fontSize: 12 }}>Select Photo</div>
                      </div>
                    )}
                  </Upload>
                  {fileList.length > 0 && (
                    <Button
                      type="primary"
                      onClick={handleUpload}
                      loading={uploading}
                      style={{
                        marginTop: 12,
                        background: colors.seaBuckthorn,
                        borderColor: colors.seaBuckthorn,
                      }}
                    >
                      {uploading ? 'Uploading...' : 'Save Photo'}
                    </Button>
                  )}
                </>
              )}
            </div>

            <Button
              type="primary"
              size="large"
              onClick={handleClose}
              style={{
                background: colors.seaBuckthorn,
                borderColor: colors.seaBuckthorn,
                boxShadow: `0 4px 12px ${colors.seaBuckthorn}40`,
                height: 44,
                paddingInline: 32,
              }}
            >
              Thanks!
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default FirstHarvestModal;
