import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Clips Page (Placeholder)
 *
 * Video clip archive from hornet detection events.
 * Content will be expanded in Epic 4 (Clip Archive & Video Review).
 */
export function Clips() {
  return (
    <div>
      <Title level={2}>Clips</Title>
      <Paragraph>
        Browse and review video clips from hornet detection events. Archive and playback will appear here.
      </Paragraph>
    </div>
  );
}

export default Clips;
