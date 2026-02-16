import { Typography, Button, Card } from 'antd';
import { Link } from 'react-router-dom';
import { colors } from '../theme/apisTheme';

const { Title, Paragraph } = Typography;

export function NotFound() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Card style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
        <Title level={1} style={{ color: colors.brownBramble, marginBottom: 8 }}>
          404
        </Title>
        <Title level={3} style={{ color: colors.brownBramble, marginTop: 0 }}>
          Page Not Found
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 24 }}>
          The page you're looking for doesn't exist or has been moved.
        </Paragraph>
        <Link to="/">
          <Button type="primary" size="large">
            Back to Dashboard
          </Button>
        </Link>
      </Card>
    </div>
  );
}

export default NotFound;
