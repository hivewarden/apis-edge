import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Settings Page (Placeholder)
 *
 * Application and user settings.
 * Content will be expanded as features require configuration.
 */
export function Settings() {
  return (
    <div>
      <Title level={2}>Settings</Title>
      <Paragraph>
        Configure your APIS dashboard settings. Preferences and account options will appear here.
      </Paragraph>
    </div>
  );
}

export default Settings;
