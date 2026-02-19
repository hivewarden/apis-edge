/**
 * Mock for @ant-design/icons
 * Resolve-alias approach avoids Proxy hangs in vitest module resolution.
 * Each icon is a plain span with data-testid and className for test queries.
 */
import { createElement } from 'react';

function makeIcon(name: string) {
  const kebab = name
    .replace(/Outlined|Filled|TwoTone/, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
  const Icon = (props: Record<string, unknown>) =>
    createElement('span', {
      'data-testid': `icon-${name}`,
      className: `anticon anticon-${kebab}`,
      ...props,
    });
  Icon.displayName = name;
  return Icon;
}

// All icons used in source and tests
export const AimOutlined = makeIcon('AimOutlined');
export const AlertOutlined = makeIcon('AlertOutlined');
export const ApiOutlined = makeIcon('ApiOutlined');
export const AppstoreOutlined = makeIcon('AppstoreOutlined');
export const AreaChartOutlined = makeIcon('AreaChartOutlined');
export const ArrowDownOutlined = makeIcon('ArrowDownOutlined');
export const ArrowLeftOutlined = makeIcon('ArrowLeftOutlined');
export const ArrowRightOutlined = makeIcon('ArrowRightOutlined');
export const ArrowUpOutlined = makeIcon('ArrowUpOutlined');
export const AudioOutlined = makeIcon('AudioOutlined');
export const BarChartOutlined = makeIcon('BarChartOutlined');
export const BellOutlined = makeIcon('BellOutlined');
export const BugOutlined = makeIcon('BugOutlined');
export const BulbOutlined = makeIcon('BulbOutlined');
export const CalculatorOutlined = makeIcon('CalculatorOutlined');
export const CalendarOutlined = makeIcon('CalendarOutlined');
export const CameraOutlined = makeIcon('CameraOutlined');
export const CheckCircleOutlined = makeIcon('CheckCircleOutlined');
export const CheckOutlined = makeIcon('CheckOutlined');
export const CheckSquareOutlined = makeIcon('CheckSquareOutlined');
export const ClearOutlined = makeIcon('ClearOutlined');
export const ClockCircleOutlined = makeIcon('ClockCircleOutlined');
export const CloseCircleOutlined = makeIcon('CloseCircleOutlined');
export const CloseOutlined = makeIcon('CloseOutlined');
export const CloudDownloadOutlined = makeIcon('CloudDownloadOutlined');
export const CloudOutlined = makeIcon('CloudOutlined');
export const CloudSyncOutlined = makeIcon('CloudSyncOutlined');
export const CodeOutlined = makeIcon('CodeOutlined');
export const CoffeeOutlined = makeIcon('CoffeeOutlined');
export const ControlOutlined = makeIcon('ControlOutlined');
export const CopyOutlined = makeIcon('CopyOutlined');
export const CrownOutlined = makeIcon('CrownOutlined');
export const DashboardOutlined = makeIcon('DashboardOutlined');
export const DatabaseOutlined = makeIcon('DatabaseOutlined');
export const DeleteOutlined = makeIcon('DeleteOutlined');
export const DiffOutlined = makeIcon('DiffOutlined');
export const DisconnectOutlined = makeIcon('DisconnectOutlined');
export const DownloadOutlined = makeIcon('DownloadOutlined');
export const DownOutlined = makeIcon('DownOutlined');
export const EditOutlined = makeIcon('EditOutlined');
export const EnvironmentOutlined = makeIcon('EnvironmentOutlined');
export const ExclamationCircleOutlined = makeIcon('ExclamationCircleOutlined');
export const ExperimentOutlined = makeIcon('ExperimentOutlined');
export const ExportOutlined = makeIcon('ExportOutlined');
export const EyeInvisibleOutlined = makeIcon('EyeInvisibleOutlined');
export const EyeOutlined = makeIcon('EyeOutlined');
export const FileMarkdownOutlined = makeIcon('FileMarkdownOutlined');
export const FileSearchOutlined = makeIcon('FileSearchOutlined');
export const FileTextOutlined = makeIcon('FileTextOutlined');
export const FilterOutlined = makeIcon('FilterOutlined');
export const FormOutlined = makeIcon('FormOutlined');
export const GiftOutlined = makeIcon('GiftOutlined');
export const GlobalOutlined = makeIcon('GlobalOutlined');
export const HddOutlined = makeIcon('HddOutlined');
export const HeartOutlined = makeIcon('HeartOutlined');
export const HistoryOutlined = makeIcon('HistoryOutlined');
export const HomeOutlined = makeIcon('HomeOutlined');
export const InfoCircleOutlined = makeIcon('InfoCircleOutlined');
export const KeyOutlined = makeIcon('KeyOutlined');
export const LeftOutlined = makeIcon('LeftOutlined');
export const LineChartOutlined = makeIcon('LineChartOutlined');
export const LinkOutlined = makeIcon('LinkOutlined');
export const LoadingOutlined = makeIcon('LoadingOutlined');
export const LockOutlined = makeIcon('LockOutlined');
export const LoginOutlined = makeIcon('LoginOutlined');
export const MailOutlined = makeIcon('MailOutlined');
export const MedicineBoxOutlined = makeIcon('MedicineBoxOutlined');
export const MinusCircleOutlined = makeIcon('MinusCircleOutlined');
export const MinusOutlined = makeIcon('MinusOutlined');
export const MobileOutlined = makeIcon('MobileOutlined');
export const MoreOutlined = makeIcon('MoreOutlined');
export const PlayCircleOutlined = makeIcon('PlayCircleOutlined');
export const PlusOutlined = makeIcon('PlusOutlined');
export const PlusSquareOutlined = makeIcon('PlusSquareOutlined');
export const PrinterOutlined = makeIcon('PrinterOutlined');
export const QrcodeOutlined = makeIcon('QrcodeOutlined');
export const QuestionCircleOutlined = makeIcon('QuestionCircleOutlined');
export const RadarChartOutlined = makeIcon('RadarChartOutlined');
export const ReloadOutlined = makeIcon('ReloadOutlined');
export const RequiredFilled = makeIcon('RequiredFilled');
export const RightOutlined = makeIcon('RightOutlined');
export const RiseOutlined = makeIcon('RiseOutlined');
export const RobotOutlined = makeIcon('RobotOutlined');
export const RocketOutlined = makeIcon('RocketOutlined');
export const SafetyOutlined = makeIcon('SafetyOutlined');
export const SaveOutlined = makeIcon('SaveOutlined');
export const ScissorOutlined = makeIcon('ScissorOutlined');
export const SearchOutlined = makeIcon('SearchOutlined');
export const SettingOutlined = makeIcon('SettingOutlined');
export const ShareAltOutlined = makeIcon('ShareAltOutlined');
export const StopOutlined = makeIcon('StopOutlined');
export const SunOutlined = makeIcon('SunOutlined');
export const SwapOutlined = makeIcon('SwapOutlined');
export const SyncOutlined = makeIcon('SyncOutlined');
export const TagsOutlined = makeIcon('TagsOutlined');
export const TeamOutlined = makeIcon('TeamOutlined');
export const ThunderboltOutlined = makeIcon('ThunderboltOutlined');
export const ToolOutlined = makeIcon('ToolOutlined');
export const TrophyOutlined = makeIcon('TrophyOutlined');
export const UndoOutlined = makeIcon('UndoOutlined');
export const UnorderedListOutlined = makeIcon('UnorderedListOutlined');
export const UpOutlined = makeIcon('UpOutlined');
export const UserAddOutlined = makeIcon('UserAddOutlined');
export const UserOutlined = makeIcon('UserOutlined');
export const VideoCameraOutlined = makeIcon('VideoCameraOutlined');
export const WarningOutlined = makeIcon('WarningOutlined');
export const WifiOutlined = makeIcon('WifiOutlined');

// Default export
export default {};
