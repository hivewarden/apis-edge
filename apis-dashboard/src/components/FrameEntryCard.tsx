import { Card, InputNumber, Typography, Space, Alert, Collapse, Row, Col, Tag } from 'antd';
import { ExperimentOutlined, WarningOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';

const { Text, Title } = Typography;

export interface FrameData {
  boxPosition: number;
  boxType: 'brood' | 'super';
  totalFrames: number;
  drawnFrames: number;
  broodFrames: number;
  honeyFrames: number;
  pollenFrames: number;
}

interface FrameEntryCardProps {
  broodBoxes: number;
  honeySupers: number;
  frames: FrameData[];
  onChange: (frames: FrameData[]) => void;
}

const DEFAULT_TOTAL_FRAMES = 10;

/**
 * FrameEntryCard Component
 *
 * Provides per-box frame tracking for advanced inspection mode.
 * Auto-calculates empty/foundation count and validates frame counts.
 *
 * Part of Epic 5, Story 5.5: Frame-Level Data Tracking
 */
export function FrameEntryCard({
  broodBoxes,
  honeySupers,
  frames,
  onChange,
}: FrameEntryCardProps) {
  // Initialize frame data if empty
  const initializeFrames = (): FrameData[] => {
    const newFrames: FrameData[] = [];
    // Add brood boxes (position 1 = bottom)
    for (let i = 0; i < broodBoxes; i++) {
      newFrames.push({
        boxPosition: i + 1,
        boxType: 'brood',
        totalFrames: DEFAULT_TOTAL_FRAMES,
        drawnFrames: 0,
        broodFrames: 0,
        honeyFrames: 0,
        pollenFrames: 0,
      });
    }
    // Add honey supers (continue position numbering)
    for (let i = 0; i < honeySupers; i++) {
      newFrames.push({
        boxPosition: broodBoxes + i + 1,
        boxType: 'super',
        totalFrames: DEFAULT_TOTAL_FRAMES,
        drawnFrames: 0,
        broodFrames: 0,
        honeyFrames: 0,
        pollenFrames: 0,
      });
    }
    return newFrames;
  };

  // Ensure we have the right number of frame entries
  const ensureFrameData = (): FrameData[] => {
    const totalBoxes = broodBoxes + honeySupers;
    if (frames.length !== totalBoxes) {
      return initializeFrames();
    }
    return frames;
  };

  const currentFrames = ensureFrameData();

  const updateFrame = (position: number, field: keyof FrameData, value: number | null) => {
    const updated = currentFrames.map((f) =>
      f.boxPosition === position ? { ...f, [field]: value ?? 0 } : f
    );
    onChange(updated);
  };

  const validateFrame = (frame: FrameData): string | null => {
    if (frame.drawnFrames > frame.totalFrames) {
      return 'Drawn frames cannot exceed total frames';
    }
    if (frame.broodFrames + frame.honeyFrames > frame.drawnFrames) {
      return 'Brood + honey frames cannot exceed drawn frames';
    }
    return null;
  };

  const calculateEmpty = (frame: FrameData): number => {
    return Math.max(0, frame.totalFrames - frame.drawnFrames);
  };

  const renderBoxEntry = (frame: FrameData) => {
    const error = validateFrame(frame);
    const emptyFrames = calculateEmpty(frame);
    const boxLabel = frame.boxType === 'brood'
      ? `Brood Box ${frame.boxPosition}`
      : `Honey Super ${frame.boxPosition - broodBoxes}`;

    return (
      <div key={frame.boxPosition} style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 8,
          padding: '8px 12px',
          backgroundColor: frame.boxType === 'brood' ? 'rgba(139, 69, 19, 0.1)' : 'rgba(247, 164, 45, 0.1)',
          borderRadius: 8,
        }}>
          <Tag color={frame.boxType === 'brood' ? colors.brownBramble : colors.seaBuckthorn}>
            {frame.boxType === 'brood' ? 'Brood' : 'Super'}
          </Tag>
          <Text strong style={{ marginLeft: 8 }}>{boxLabel}</Text>
          {emptyFrames > 0 && (
            <Tag style={{ marginLeft: 'auto' }}>{emptyFrames} empty/foundation</Tag>
          )}
        </div>

        {error && (
          <Alert
            type="error"
            message={error}
            icon={<WarningOutlined />}
            showIcon
            style={{ marginBottom: 8 }}
          />
        )}

        <Row gutter={[16, 8]}>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Total</Text>
            <InputNumber
              min={1}
              max={20}
              value={frame.totalFrames}
              onChange={(v) => updateFrame(frame.boxPosition, 'totalFrames', v)}
              style={{ width: '100%' }}
              size="small"
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Drawn</Text>
            <InputNumber
              min={0}
              max={frame.totalFrames}
              value={frame.drawnFrames}
              onChange={(v) => updateFrame(frame.boxPosition, 'drawnFrames', v)}
              style={{ width: '100%' }}
              size="small"
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 12, color: '#8B4513' }}>Brood</Text>
            <InputNumber
              min={0}
              max={frame.drawnFrames}
              value={frame.broodFrames}
              onChange={(v) => updateFrame(frame.boxPosition, 'broodFrames', v)}
              style={{ width: '100%' }}
              size="small"
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 12, color: colors.seaBuckthorn }}>Honey</Text>
            <InputNumber
              min={0}
              max={frame.drawnFrames}
              value={frame.honeyFrames}
              onChange={(v) => updateFrame(frame.boxPosition, 'honeyFrames', v)}
              style={{ width: '100%' }}
              size="small"
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 12, color: '#FFA500' }}>Pollen</Text>
            <InputNumber
              min={0}
              max={frame.drawnFrames}
              value={frame.pollenFrames}
              onChange={(v) => updateFrame(frame.boxPosition, 'pollenFrames', v)}
              style={{ width: '100%' }}
              size="small"
            />
          </Col>
        </Row>
      </div>
    );
  };

  // No boxes to track
  if (broodBoxes === 0 && honeySupers === 0) {
    return (
      <Alert
        type="info"
        message="No boxes configured for this hive"
        description="Configure brood boxes and honey supers in the hive settings to enable frame tracking."
      />
    );
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Collapse
        ghost
        items={[
          {
            key: 'frames',
            label: (
              <Space>
                <ExperimentOutlined style={{ color: colors.seaBuckthorn }} />
                <Text strong>Frame-Level Data</Text>
                <Text type="secondary">(Advanced)</Text>
              </Space>
            ),
            children: (
              <div style={{ paddingTop: 8 }}>
                <Alert
                  type="info"
                  message="Track frame counts for each box"
                  description="Record drawn comb, brood, honey, and pollen frames. Empty frames are auto-calculated."
                  showIcon
                  style={{ marginBottom: 16 }}
                />

                <Title level={5} style={{ marginBottom: 12 }}>Brood Boxes</Title>
                {currentFrames
                  .filter((f) => f.boxType === 'brood')
                  .map(renderBoxEntry)}

                {honeySupers > 0 && (
                  <>
                    <Title level={5} style={{ marginBottom: 12, marginTop: 16 }}>Honey Supers</Title>
                    {currentFrames
                      .filter((f) => f.boxType === 'super')
                      .map(renderBoxEntry)}
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}

export default FrameEntryCard;
