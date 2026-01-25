import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Space, Empty, Spin, Tag, message, Tooltip } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  AimOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Clip } from '../hooks/useClips';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';

export interface ClipPlayerModalProps {
  open: boolean;
  clip: Clip | null;
  clips: Clip[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDeleteSuccess?: () => void;
}

interface Detection {
  id: string;
  confidence?: number; // 0-1 scale (null if not available)
  laser_activated: boolean;
  detected_at: string;
}

interface DetectionResponse {
  data: Detection;
}

/**
 * Format duration as mm:ss
 */
function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * ClipPlayerModal Component
 *
 * Cinematic video player modal for detection clips.
 * Features a dark theater-style design with amber accents.
 *
 * Part of Epic 4, Story 4.3 (Clip Video Playback)
 */
export function ClipPlayerModal({
  open,
  clip,
  clips,
  currentIndex,
  onClose,
  onNavigate,
  onDeleteSuccess,
}: ClipPlayerModalProps) {
  const [videoError, setVideoError] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [loadingDetection, setLoadingDetection] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch detection details when clip changes
  useEffect(() => {
    if (!clip?.detection_id) {
      setDetection(null);
      return;
    }

    const fetchDetection = async () => {
      setLoadingDetection(true);
      try {
        const response = await apiClient.get<DetectionResponse>(
          `/detections/${clip.detection_id}`
        );
        setDetection(response.data.data);
      } catch {
        setDetection(null);
      } finally {
        setLoadingDetection(false);
      }
    };

    fetchDetection();
  }, [clip?.detection_id]);

  // Reset video error state when clip changes
  useEffect(() => {
    setVideoError(false);
  }, [clip?.id]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < clips.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, clips.length, onNavigate, onClose]);

  // Stop video when modal closes
  const handleClose = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    onClose();
  }, [onClose]);

  // Handle clip deletion
  const handleDelete = useCallback(() => {
    if (!clip) return;

    Modal.confirm({
      title: 'Delete Clip',
      icon: <ExclamationCircleOutlined style={{ color: colors.error }} />,
      content: 'Delete this clip permanently? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiClient.delete(`/clips/${clip.id}`);
          message.success('Clip deleted');
          handleClose();
          onDeleteSuccess?.();
        } catch {
          message.error('Failed to delete clip');
        }
      },
    });
  }, [clip, handleClose, onDeleteSuccess]);

  if (!clip) return null;

  const formattedDate = dayjs(clip.recorded_at).format('MMMM D, YYYY');
  const formattedTime = dayjs(clip.recorded_at).format('HH:mm:ss');
  const videoUrl = `/api/clips/${clip.id}/video`;
  const downloadUrl = `${videoUrl}?download=1`;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < clips.length - 1;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={null}
      width={900}
      destroyOnClose
      centered
      footer={null}
      closeIcon={null}
      styles={{
        mask: {
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
        },
        content: {
          background: 'transparent',
          boxShadow: 'none',
          padding: 0,
        },
        body: {
          padding: 0,
        },
      }}
    >
      {/* Main container with amber glow */}
      <div
        style={{
          background: `linear-gradient(145deg, ${colors.brownBramble} 0%, #1a0a02 100%)`,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: `0 0 80px ${colors.seaBuckthorn}30, 0 20px 60px rgba(0,0,0,0.5)`,
          border: `1px solid ${colors.seaBuckthorn}40`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${colors.seaBuckthorn}20`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Detection badge */}
            <div
              style={{
                background: `linear-gradient(135deg, ${colors.seaBuckthorn} 0%, #e68a00 100%)`,
                padding: '6px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <AimOutlined style={{ color: 'white', fontSize: 14 }} />
              <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>
                DETECTION
              </span>
            </div>

            {/* Date and time */}
            <div>
              <div style={{ color: colors.salomie, fontSize: 15, fontWeight: 600 }}>
                {formattedDate}
              </div>
              <div style={{ color: colors.salomie, opacity: 0.7, fontSize: 13 }}>
                {formattedTime}
              </div>
            </div>
          </div>

          {/* Close button */}
          <Button
            type="text"
            onClick={handleClose}
            style={{
              color: colors.salomie,
              opacity: 0.7,
              fontSize: 20,
            }}
          >
            ✕
          </Button>
        </div>

        {/* Video container */}
        <div style={{ position: 'relative', background: '#000' }}>
          {videoError ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
                gap: 16,
              }}
            >
              <Empty
                description={
                  <span style={{ color: colors.salomie, opacity: 0.7 }}>
                    Video unavailable
                  </span>
                }
              />
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                href={downloadUrl}
                download
                style={{
                  background: colors.seaBuckthorn,
                  borderColor: colors.seaBuckthorn,
                }}
              >
                Download file
              </Button>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              style={{
                width: '100%',
                maxHeight: '500px',
                display: 'block',
              }}
              onError={() => setVideoError(true)}
            />
          )}

          {/* Navigation arrows - floating */}
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={!hasPrevious}
            aria-label="Previous clip"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: hasPrevious ? `${colors.brownBramble}cc` : `${colors.brownBramble}40`,
              color: hasPrevious ? colors.salomie : `${colors.salomie}40`,
              fontSize: 18,
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={!hasNext}
            aria-label="Next clip"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: hasNext ? `${colors.brownBramble}cc` : `${colors.brownBramble}40`,
              color: hasNext ? colors.salomie : `${colors.salomie}40`,
              fontSize: 18,
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </div>

        {/* Metadata panel */}
        <div
          style={{
            padding: '20px 24px',
            background: `linear-gradient(180deg, ${colors.brownBramble}80 0%, ${colors.brownBramble} 100%)`,
          }}
        >
          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            {/* Unit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EyeOutlined style={{ color: colors.seaBuckthorn, fontSize: 16 }} />
              <span style={{ color: colors.salomie, opacity: 0.7, fontSize: 13 }}>
                Unit:
              </span>
              <span style={{ color: colors.salomie, fontWeight: 500 }}>
                {clip.unit_name || 'Unknown'}
              </span>
            </div>

            {/* Duration */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: colors.seaBuckthorn, fontSize: 16 }} />
              <span style={{ color: colors.salomie, opacity: 0.7, fontSize: 13 }}>
                Duration:
              </span>
              <span style={{ color: colors.salomie, fontWeight: 500 }}>
                {formatDuration(clip.duration_seconds)}
              </span>
            </div>

            {/* Detection details */}
            {loadingDetection ? (
              <Spin size="small" />
            ) : detection ? (
              <>
                {/* Confidence */}
                {detection.confidence != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AimOutlined style={{ color: colors.seaBuckthorn, fontSize: 16 }} />
                    <span style={{ color: colors.salomie, opacity: 0.7, fontSize: 13 }}>
                      Confidence:
                    </span>
                    <Tag
                      color={
                        detection.confidence >= 0.8
                          ? 'green'
                          : detection.confidence >= 0.5
                          ? 'orange'
                          : 'red'
                      }
                      style={{ margin: 0 }}
                    >
                      {Math.round(detection.confidence * 100)}%
                    </Tag>
                  </div>
                )}

                {/* Laser status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ThunderboltOutlined
                    style={{
                      color: detection.laser_activated ? colors.seaBuckthorn : '#666',
                      fontSize: 16,
                    }}
                  />
                  <span style={{ color: colors.salomie, opacity: 0.7, fontSize: 13 }}>
                    Laser:
                  </span>
                  {detection.laser_activated ? (
                    <Tag icon={<CheckCircleOutlined />} color={colors.seaBuckthorn}>
                      Activated
                    </Tag>
                  ) : (
                    <Tag icon={<CloseCircleOutlined />} color="default">
                      Not fired
                    </Tag>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Actions row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 16,
              borderTop: `1px solid ${colors.seaBuckthorn}20`,
            }}
          >
            {/* Navigation info */}
            <div
              style={{
                color: colors.salomie,
                opacity: 0.6,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                {currentIndex + 1} / {clips.length}
              </span>
              <span style={{ opacity: 0.5 }}>•</span>
              <span>Use ← → to navigate</span>
            </div>

            {/* Action buttons */}
            <Space>
              <Tooltip title="Download clip">
                <Button
                  icon={<DownloadOutlined />}
                  href={downloadUrl}
                  download
                  style={{
                    color: colors.salomie,
                    borderColor: colors.seaBuckthorn + '60',
                    background: 'transparent',
                  }}
                >
                  Download
                </Button>
              </Tooltip>
              <Tooltip title="Delete clip permanently">
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleDelete}
                  aria-label="Delete clip permanently"
                  style={{
                    borderColor: `${colors.error}80`,
                  }}
                >
                  Delete
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ClipPlayerModal;
