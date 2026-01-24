import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Hives Page (Placeholder)
 *
 * Manages beehives and hive inspections.
 * Content will be expanded in Epic 5 (Hive Management & Inspections).
 */
export function Hives() {
  return (
    <div>
      <Title level={2}>Hives</Title>
      <Paragraph>
        Manage your beehives and track inspections. Hive diary and monitoring will appear here.
      </Paragraph>
    </div>
  );
}

export default Hives;
