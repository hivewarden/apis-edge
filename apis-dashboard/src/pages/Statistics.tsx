import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Statistics Page (Placeholder)
 *
 * Analytics and pattern visualizations for hornet activity.
 * Content will be expanded in Epic 3 (Hornet Detection Dashboard).
 */
export function Statistics() {
  return (
    <div>
      <Title level={2}>Statistics</Title>
      <Paragraph>
        View analytics and patterns from your hornet detection data. Charts and insights will appear here.
      </Paragraph>
    </div>
  );
}

export default Statistics;
