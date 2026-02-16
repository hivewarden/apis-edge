import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Space, Empty, Spin, Tag, message, Tooltip } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  AimOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Clip } from '../hooks/useClips';
import { useDetection } from '../hooks/useDetection';
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
  const [videoLoading, setVideoLoading] = useState(true);
  // S5-L7: Track autoplay failure so we can show a "tap to play" prompt on mobile
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isClosingRef = useRef(false);

  // Use hook for detection data
  const { detection, loading: loadingDetection } = useDetection(clip?.detection_id);

  // Reset video error and loading state when clip changes
  useEffect(() => {
    setVideoError(false);
    setVideoLoading(true);
    setAutoplayBlocked(false);
  }, [clip?.id]);

  // Track closing state
  useEffect(() => {
    if (open) {
      isClosingRef.current = false;
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard against events during close transition
      if (isClosingRef.current) return;

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < clips.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (e.key === 'Escape') {
        isClosingRef.current = true;
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, clips.length, onNavigate, onClose]);

  // S5-L7: Attempt autoplay on load and handle mobile browser blocks gracefully.
  // Mobile browsers (especially iOS Safari) block autoplay unless the user has
  // already interacted with the page. When blocked, we show a "tap to play" overlay.
  const handleLoadedData = useCallback(() => {
    setVideoLoading(false);
    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay was prevented - show tap to play prompt
          setAutoplayBlocked(true);
        });
      }
    }
  }, []);

  const handleTapToPlay = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Still can't play - ignore
      });
      setAutoplayBlocked(false);
    }
  }, []);

  // Stop video when modal closes
  const handleClose = useCallback(() => {
    isClosingRef.current = true;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    onClose();
  }, [onClose]);

  // State for delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Handle clip deletion with custom styled modal
  const handleDeleteClick = useCallback(() => {
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!clip) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/clips/${clip.id}`);
      message.success('Clip deleted');
      setDeleteModalOpen(false);
      handleClose();
      onDeleteSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      message.error(`Failed to delete clip: ${errorMessage}. Please try again.`);
    } finally {
      setDeleting(false);
    }
  }, [clip, handleClose, onDeleteSuccess]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteModalOpen(false);
  }, []);

  if (!clip) return null;

  const formattedDate = dayjs(clip.recorded_at).format('MMMM D, YYYY');
  const formattedTime = dayjs(clip.recorded_at).format('HH:mm:ss');
  const videoUrl = `/api/clips/${clip.id}/video`;
  const downloadUrl = `${videoUrl}?download=1`;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < clips.length - 1;

  return (
    <>
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
          background: 'rgba(102, 38, 4, 0.3)',
          backdropFilter: 'blur(2px)',
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
      {/* Navigation arrows - positioned OUTSIDE the modal */}
      <Button
        type="text"
        icon={<LeftOutlined />}
        onClick={() => onNavigate(currentIndex - 1)}
        disabled={!hasPrevious}
        aria-label="Previous clip"
        style={{
          position: 'fixed',
          left: 'calc(50% - 500px)',
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
          zIndex: 1001,
        }}
      />
      <Button
        type="text"
        icon={<RightOutlined />}
        onClick={() => onNavigate(currentIndex + 1)}
        disabled={!hasNext}
        aria-label="Next clip"
        style={{
          position: 'fixed',
          right: 'calc(50% - 500px)',
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
          zIndex: 1001,
        }}
      />

      {/* Main container with Coconut Cream background */}
      <div
        style={{
          background: colors.coconutCream,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${colors.brownBramble}20`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: colors.coconutCream,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Detection badge */}
            <div
              style={{
                background: colors.seaBuckthorn,
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
              <div style={{ color: colors.brownBramble, fontSize: 15, fontWeight: 600 }}>
                {formattedDate}
              </div>
              <div style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 13 }}>
                {formattedTime}
              </div>
            </div>
          </div>

          {/* Close button */}
          <Button
            type="default"
            shape="circle"
            icon={<CloseOutlined style={{ fontSize: 14 }} />}
            onClick={handleClose}
            style={{
              minWidth: 36,
              width: 36,
              height: 36,
              color: colors.brownBramble,
              borderColor: 'rgba(102, 38, 4, 0.4)',
              backgroundColor: 'rgba(102, 38, 4, 0.1)',
            }}
          />
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
            <>
              {videoLoading && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 1,
                  }}
                >
                  <Spin size="large" />
                </div>
              )}
              <video
                ref={videoRef}
                src={videoUrl}
                poster={`/api/clips/${clip.id}/thumbnail`}
                controls
                playsInline
                style={{
                  width: '100%',
                  maxHeight: '500px',
                  display: 'block',
                }}
                onLoadedData={handleLoadedData}
                onWaiting={() => setVideoLoading(true)}
                onPlaying={() => { setVideoLoading(false); setAutoplayBlocked(false); }}
                onError={() => setVideoError(true)}
              />
              {/* S5-L7: Tap to play overlay for mobile browsers that block autoplay */}
              {autoplayBlocked && (
                <div
                  onClick={handleTapToPlay}
                  role="button"
                  tabIndex={0}
                  aria-label="Tap to play video"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTapToPlay(); }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.5)',
                    cursor: 'pointer',
                    zIndex: 2,
                  }}
                >
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: `${colors.seaBuckthorn}cc`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{ color: 'white', fontSize: 28, marginLeft: 4 }}>&#9654;</span>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Metadata panel */}
        <div
          style={{
            padding: '20px 24px',
            background: colors.coconutCream,
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
              <span style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 13 }}>
                Unit:
              </span>
              <span style={{ color: colors.brownBramble, fontWeight: 500 }}>
                {clip.unit_name || 'Unknown'}
              </span>
            </div>

            {/* Duration */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: colors.seaBuckthorn, fontSize: 16 }} />
              <span style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 13 }}>
                Duration:
              </span>
              <span style={{ color: colors.brownBramble, fontWeight: 500 }}>
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
                    <span style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 13 }}>
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
                  <span style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 13 }}>
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
              borderTop: `1px solid ${colors.brownBramble}20`,
            }}
          >
            {/* Navigation info */}
            <div
              style={{
                color: colors.brownBramble,
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
              <span>Use arrow keys to navigate</span>
            </div>

            {/* Action buttons */}
            <Space>
              <Tooltip title="Download clip">
                <a href={downloadUrl} download style={{ textDecoration: 'none' }}>
                  <Button
                    icon={<DownloadOutlined />}
                    style={{
                      color: colors.brownBramble,
                      borderColor: colors.brownBramble + '40',
                      background: 'transparent',
                    }}
                  >
                    Download
                  </Button>
                </a>
              </Tooltip>
              <Tooltip title="Delete clip permanently">
                <Button
                  icon={<DeleteOutlined />}
                  onClick={handleDeleteClick}
                  aria-label="Delete clip permanently"
                  style={{
                    color: '#c4857a',
                    borderColor: '#c4857a',
                    background: 'transparent',
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

    {/* Custom delete confirmation modal */}
    <Modal
      open={deleteModalOpen}
      onCancel={handleDeleteCancel}
      title={null}
      footer={null}
      centered
      width={400}
      styles={{
        mask: {
          background: 'rgba(102, 38, 4, 0.3)',
          backdropFilter: 'blur(2px)',
        },
        content: {
          borderRadius: 16,
          overflow: 'hidden',
        },
        body: {
          padding: 24,
          background: colors.coconutCream,
        },
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <DeleteOutlined
          style={{
            fontSize: 48,
            color: '#c4857a',
            marginBottom: 16,
          }}
        />
        <h3
          style={{
            color: colors.brownBramble,
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Delete Clip
        </h3>
        <p
          style={{
            color: colors.brownBramble,
            opacity: 0.7,
            marginBottom: 24,
          }}
        >
          Delete this clip permanently? This action cannot be undone.
        </p>
        <Space size="middle">
          <Button
            onClick={handleDeleteCancel}
            style={{
              borderColor: colors.brownBramble + '40',
              color: colors.brownBramble,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            loading={deleting}
            style={{
              background: '#c4857a',
              borderColor: '#c4857a',
              color: 'white',
            }}
          >
            Delete
          </Button>
        </Space>
      </div>
    </Modal>
    </>
  );
}

export default ClipPlayerModal;
