import { useState, useEffect, Suspense, useMemo } from 'react';
import { Layout, Menu, Button, Drawer, Grid, Avatar, Typography, Space, Tooltip, Alert } from 'antd';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { getNavItemsWithBadges } from './navItems';
import { colors } from '../../theme/apisTheme';
import { useAuth, useQRScanner, useOnlineStatus, useImpersonation, useTaskStats } from '../../hooks';
import { useBackgroundSyncContext } from '../../context';
import { OfflineBanner } from '../OfflineBanner';
import { LazyQRScannerModal } from '../lazy';
import { ImpersonationBanner } from '../admin/ImpersonationBanner';
import { DEV_MODE } from '../../config';
import { getSafeImageUrl } from '../../utils/urlValidation';

const { Sider, Content, Header } = Layout;
const { useBreakpoint } = Grid;
const { Text } = Typography;

/**
 * Material Symbols Icon Component
 *
 * Renders Material Symbols Outlined icons with DESIGN-KEY specifications:
 * - Icon size: 20-22px
 * - Style: FILL 0, wght 300 (outlined, light weight)
 */
interface MaterialIconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}

function MaterialIcon({ name, size = 22, style }: MaterialIconProps) {
  return (
    <span
      className="material-symbols-outlined"
      style={{
        fontSize: size,
        fontVariationSettings: "'FILL' 0, 'wght' 300",
        lineHeight: 1,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

/**
 * Sidebar menu styles per DESIGN-KEY:
 * - Active nav item: bg-salomie (#fcd483), rounded-full
 * - Sidebar background: white (#ffffff)
 * - Sidebar border: border-r border-orange-100 (#ece8d6)
 */
const sidebarMenuStyles = `
  /* Active menu item - bg-salomie rounded-full per DESIGN-KEY */
  .ant-menu-light .ant-menu-item-selected {
    background-color: #fcd483 !important;
    border-radius: 9999px !important;
    color: #1c160d !important;
  }
  .ant-menu-light .ant-menu-item-selected::after {
    display: none !important;
  }
  /* Hover state */
  .ant-menu-light .ant-menu-item:hover:not(.ant-menu-item-selected) {
    background-color: rgba(252, 212, 131, 0.3) !important;
    border-radius: 9999px !important;
  }
  /* Menu item padding and spacing */
  .ant-menu-light .ant-menu-item {
    margin: 4px 12px !important;
    padding: 0 16px !important;
    height: 44px !important;
    line-height: 44px !important;
    border-radius: 9999px !important;
  }
  /* Icon alignment */
  .ant-menu-light .ant-menu-item .ant-menu-item-icon {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
`;

/** localStorage key for sidebar collapse state persistence */
const COLLAPSE_KEY = 'apis-sidebar-collapsed';

/** Layout dimension constants per DESIGN-KEY */
const SIDEBAR_WIDTH_EXPANDED = 240; // 240px per mockups
const SIDEBAR_WIDTH_COLLAPSED = 80;
const COLLAPSE_BUTTON_LEFT_COLLAPSED = 24;
const COLLAPSE_BUTTON_LEFT_EXPANDED = 80;

/**
 * AppLayout Component
 *
 * Main layout wrapper providing:
 * - Desktop: Collapsible sidebar with navigation
 * - Mobile: Hamburger menu with drawer overlay
 * - User profile section with logout button
 * - Persistent collapse state via localStorage
 *
 * Uses Ant Design Layout with Sider + Content structure.
 * Integrates with React Router via Outlet for nested routes.
 */
export function AppLayout() {
  const screens = useBreakpoint();
  const isMobile = !screens.md; // True when viewport < 768px
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isSyncing, progress } = useBackgroundSyncContext();

  // QR Scanner state - Epic 7, Story 7.6
  const { isSupported: qrSupported, isOpen: qrScannerOpen, openScanner, closeScanner } = useQRScanner();
  const isOnline = useOnlineStatus();

  // Impersonation state - Epic 13, Story 13.14
  const { isImpersonating, tenantId: impersonatedTenantId, tenantName: impersonatedTenantName } = useImpersonation();

  // Task stats for navigation badge - Epic 14, Story 14.14
  const { stats: taskStats, loading: taskStatsLoading } = useTaskStats();

  // Generate nav items with dynamic badge counts
  // Memoize to avoid unnecessary re-renders
  const navItemsWithBadges = useMemo(() => {
    // Don't show badge while loading to avoid flickering
    const overdueCount = taskStatsLoading ? 0 : (taskStats?.overdue ?? 0);
    return getNavItemsWithBadges({ tasks: overdueCount });
  }, [taskStats?.overdue, taskStatsLoading]);

  // Initialize collapse state from localStorage
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    return stored === 'true';
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Persist collapse state to localStorage
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed]);

  // Close drawer on route change (handles browser back/forward navigation)
  // Intentionally excludes isMobile and drawerOpen from deps:
  // We only want to react to route changes, not state changes.
  // This ensures drawer closes on navigation without causing extra closes
  // when isMobile or drawerOpen change independently.
  useEffect(() => {
    if (isMobile && drawerOpen) {
      setDrawerOpen(false);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle navigation menu item click
  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
  };

  // Shared menu content for desktop sidebar (light theme per mockups)
  const menuContent = (
    <Menu
      theme="light"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={navItemsWithBadges}
      onClick={handleMenuClick}
      style={{
        background: 'transparent',
        border: 'none',
      }}
    />
  );

  // Mobile drawer menu (dark theme for contrast)
  const mobileMenuContent = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={navItemsWithBadges}
      onClick={handleMenuClick}
    />
  );

  // User profile section for sidebar footer - per mockups (white sidebar, dark text)
  const userSection = (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: collapsed ? '16px 8px' : '16px 20px',
        borderTop: '1px solid #ece8d6', // border-[#ece8d6] per mockups
        background: '#ffffff',
      }}
    >
      {collapsed ? (
        // Collapsed: Show only avatar with logout on click
        <div style={{ textAlign: 'center' }}>
          <Avatar
            size={40}
            icon={<MaterialIcon name="person" size={20} />}
            src={getSafeImageUrl(user?.avatar)}
            style={{
              backgroundColor: '#f3f4f6',
              border: '2px solid #fbf9e7',
            }}
          />
          <Button
            type="text"
            icon={<MaterialIcon name="logout" size={20} />}
            onClick={handleLogout}
            style={{ color: '#8c7e72', marginTop: 8, display: 'block', margin: '8px auto 0' }}
            aria-label="Logout"
            size="small"
          />
        </div>
      ) : (
        // Expanded: Show avatar, name, email, and logout per mockups
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px',
              borderRadius: 9999,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            className="hover:bg-coconut-cream"
          >
            <Avatar
              size={40}
              icon={<MaterialIcon name="person" size={20} />}
              src={getSafeImageUrl(user?.avatar)}
              style={{
                backgroundColor: '#f3f4f6',
                border: '2px solid #fbf9e7',
                flexShrink: 0,
              }}
            />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <Text
                style={{
                  color: colors.brownBramble,
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.name || 'User'}
              </Text>
              {user?.email && (
                <Text
                  style={{
                    color: '#8c7e72',
                    display: 'block',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user.email}
                </Text>
              )}
            </div>
          </div>
          <Button
            type="text"
            icon={<MaterialIcon name="logout" size={20} />}
            onClick={handleLogout}
            style={{
              color: '#8c7e72',
              width: '100%',
              textAlign: 'left',
              paddingLeft: 16,
              borderRadius: 9999,
              height: 40,
            }}
            aria-label="Logout"
          >
            Logout
          </Button>
        </Space>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Inject sidebar menu styles per DESIGN-KEY */}
      <style>{sidebarMenuStyles}</style>
      {/* Desktop Sidebar - White bg per mockups */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={SIDEBAR_WIDTH_EXPANDED}
          collapsedWidth={SIDEBAR_WIDTH_COLLAPSED}
          theme="light"
          trigger={null}
          style={{
            paddingBottom: collapsed ? 100 : 120,
            background: '#ffffff',
            borderRight: '1px solid #ece8d6', // border-[#ece8d6] per mockups
            boxShadow: '4px 0 24px -4px rgba(0,0,0,0.02)', // subtle shadow per mockups
          }}
        >
          <Logo collapsed={collapsed} variant="light" />
          {menuContent}
          <Button
            type="text"
            icon={<MaterialIcon name={collapsed ? 'menu_open' : 'menu'} size={20} />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              position: 'absolute',
              bottom: collapsed ? 90 : 110,
              left: collapsed ? COLLAPSE_BUTTON_LEFT_COLLAPSED : COLLAPSE_BUTTON_LEFT_EXPANDED,
              color: colors.coconutCream,
            }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          />
          {userSection}
        </Sider>
      )}

      {/* Mobile Header with Hamburger */}
      {isMobile && (
        <Header style={{ padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={<MaterialIcon name="menu" size={24} />}
              onClick={() => setDrawerOpen(true)}
              style={{ color: colors.coconutCream }}
              aria-label="Open navigation menu"
            />
            <Logo collapsed={false} variant="light" style={{ marginLeft: 16, padding: 0 }} />
          </div>
          {/* QR Scan button in header - Epic 7, Story 7.6 */}
          {qrSupported && isOnline && (
            <Tooltip title="Scan QR Code">
              <Button
                type="text"
                icon={<MaterialIcon name="qr_code_scanner" size={24} />}
                onClick={openScanner}
                style={{ color: colors.coconutCream, minHeight: 64, minWidth: 64 }}
                aria-label="Scan QR Code"
              />
            </Tooltip>
          )}
        </Header>
      )}

      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={SIDEBAR_WIDTH_EXPANDED}
        styles={{ body: { padding: 0, background: colors.brownBramble, position: 'relative', minHeight: '100%' } }}
      >
        <div style={{ paddingBottom: 120 }}>
          <Logo collapsed={false} variant="dark" />
          {mobileMenuContent}
        </div>
        {/* User section at bottom of drawer */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 16px',
            borderTop: `1px solid rgba(251, 249, 231, 0.2)`,
            background: colors.brownBramble,
          }}
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space>
              <Avatar
                size="small"
                icon={<MaterialIcon name="person" size={16} />}
                src={getSafeImageUrl(user?.avatar)}
                style={{ backgroundColor: colors.coconutCream, color: colors.brownBramble }}
              />
              <div>
                <Text style={{ color: colors.coconutCream, display: 'block', fontSize: 13, fontWeight: 500 }}>
                  {user?.name || 'User'}
                </Text>
                {user?.email && (
                  <Text style={{ color: 'rgba(251, 249, 231, 0.7)', display: 'block', fontSize: 11 }}>
                    {user.email}
                  </Text>
                )}
              </div>
            </Space>
            <Button
              type="text"
              icon={<MaterialIcon name="logout" size={20} />}
              onClick={handleLogout}
              style={{ color: colors.coconutCream, width: '100%', textAlign: 'left', paddingLeft: 0 }}
              aria-label="Logout"
            >
              Logout
            </Button>
          </Space>
        </div>
      </Drawer>

      <Layout style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* IMPERSONATION BANNER: Shows when super-admin is impersonating a tenant - Epic 13, Story 13.14 */}
        {isImpersonating && impersonatedTenantId && (
          <ImpersonationBanner
            tenantName={impersonatedTenantName || ''}
            tenantId={impersonatedTenantId}
          />
        )}
        {/* DEV MODE BANNER: Shows when VITE_DEV_MODE=true (matches DISABLE_AUTH on server) */}
        {DEV_MODE && (
          <Alert
            message={
              <span>
                <MaterialIcon name="warning" size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                <strong>DEV MODE</strong> - Authentication disabled (DISABLE_AUTH=true)
              </span>
            }
            type="warning"
            banner
            style={{ textAlign: 'center' }}
          />
        )}
        <OfflineBanner
          isSyncing={isSyncing}
          syncProgress={progress ? { completed: progress.completed, total: progress.total } : null}
        />
        <Content style={{ padding: 24, flex: 1 }}>
          <Outlet />
        </Content>
      </Layout>

      {/* QR Scanner Modal - Epic 7, Story 7.6 (lazy loaded) */}
      <Suspense fallback={null}>
        <LazyQRScannerModal open={qrScannerOpen} onClose={closeScanner} />
      </Suspense>
    </Layout>
  );
}

export default AppLayout;
