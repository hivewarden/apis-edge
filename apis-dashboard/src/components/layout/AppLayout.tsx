import { useState, useEffect } from 'react';
import { Layout, Menu, Button, Drawer, Grid, Avatar, Typography, Space } from 'antd';
import { MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { navItems } from './navItems';
import { colors } from '../../theme/apisTheme';
import { useAuth } from '../../hooks';

const { Sider, Content, Header } = Layout;
const { useBreakpoint } = Grid;
const { Text } = Typography;

/** localStorage key for sidebar collapse state persistence */
const COLLAPSE_KEY = 'apis-sidebar-collapsed';

/** Layout dimension constants */
const SIDEBAR_WIDTH_EXPANDED = 200;
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

  // Shared menu content for desktop sidebar and mobile drawer
  const menuContent = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={navItems}
      onClick={handleMenuClick}
    />
  );

  // User profile section for sidebar footer
  const userSection = (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: collapsed ? '12px 8px' : '12px 16px',
        borderTop: `1px solid rgba(251, 249, 231, 0.2)`, // coconutCream with opacity
        background: colors.brownBramble,
      }}
    >
      {collapsed ? (
        // Collapsed: Show only avatar with logout on click
        <div style={{ textAlign: 'center' }}>
          <Avatar
            size="small"
            icon={<UserOutlined />}
            src={user?.avatar}
            style={{ backgroundColor: colors.coconutCream, color: colors.brownBramble }}
          />
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{ color: colors.coconutCream, marginTop: 8, display: 'block', margin: '8px auto 0' }}
            aria-label="Logout"
            size="small"
          />
        </div>
      ) : (
        // Expanded: Show avatar, name, and logout button
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space>
            <Avatar
              size="small"
              icon={<UserOutlined />}
              src={user?.avatar}
              style={{ backgroundColor: colors.coconutCream, color: colors.brownBramble }}
            />
            <div style={{ overflow: 'hidden' }}>
              <Text
                style={{
                  color: colors.coconutCream,
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 110,
                }}
              >
                {user?.name || 'User'}
              </Text>
              {user?.email && (
                <Text
                  style={{
                    color: 'rgba(251, 249, 231, 0.7)',
                    display: 'block',
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 110,
                  }}
                >
                  {user.email}
                </Text>
              )}
            </div>
          </Space>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{
              color: colors.coconutCream,
              width: '100%',
              textAlign: 'left',
              paddingLeft: 0,
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
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={SIDEBAR_WIDTH_EXPANDED}
          collapsedWidth={SIDEBAR_WIDTH_COLLAPSED}
          theme="dark"
          trigger={null}
          style={{ paddingBottom: collapsed ? 100 : 120 }} // Make room for user section
        >
          <Logo collapsed={collapsed} />
          {menuContent}
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
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
        <Header style={{ padding: '0 16px', display: 'flex', alignItems: 'center' }}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ color: colors.coconutCream }}
            aria-label="Open navigation menu"
          />
          <Logo collapsed={false} style={{ marginLeft: 16 }} />
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
          <Logo collapsed={false} />
          {menuContent}
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
                icon={<UserOutlined />}
                src={user?.avatar}
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
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ color: colors.coconutCream, width: '100%', textAlign: 'left', paddingLeft: 0 }}
              aria-label="Logout"
            >
              Logout
            </Button>
          </Space>
        </div>
      </Drawer>

      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}

export default AppLayout;
