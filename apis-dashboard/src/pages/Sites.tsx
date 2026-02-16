import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Row,
  Col,
  Empty,
  Spin,
} from 'antd';
import { useSites } from '../hooks';
import { SiteMapThumbnailLazy as SiteMapThumbnail } from '../components/lazy';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;

/**
 * Sites Page
 *
 * Displays a grid of all sites (apiaries) for the authenticated user.
 * Allows navigation to site details and creation of new sites.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 * Updated to match DESIGN-KEY mockups (apis_sites_overview)
 */
export function Sites() {
  const navigate = useNavigate();

  // Use hook for sites
  const { sites, loading } = useSites();

  const handleSiteClick = (id: string) => {
    navigate(`/sites/${id}`);
  };

  const handleCreateSite = () => {
    navigate('/sites/create');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* Header per mockup: title + subtitle + rounded-full button */}
      <header style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 32,
        gap: 16,
      }}>
        <div>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: colors.brownBramble,
            }}
          >
            Your Sites
          </Title>
          <Text style={{ color: '#9c8749', fontSize: 14, fontWeight: 500 }}>
            Manage your apiary locations and units.
          </Text>
        </div>
        <Button
          type="primary"
          onClick={handleCreateSite}
          style={{
            borderRadius: 9999, // rounded-full
            height: 48,
            paddingLeft: 24,
            paddingRight: 24,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(247, 164, 45, 0.35)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
          Add Site
        </Button>
      </header>

      {sites.length === 0 ? (
        <Empty
          description="No sites yet"
          style={{ marginTop: 48 }}
        >
          <Button
            type="primary"
            onClick={handleCreateSite}
            style={{
              borderRadius: 9999,
              height: 48,
              paddingLeft: 24,
              paddingRight: 24,
              fontWeight: 700,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, marginRight: 8 }}>add</span>
            Create your first site
          </Button>
        </Empty>
      ) : (
        <Row gutter={[24, 24]}>
          {sites.map((site) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={site.id}>
              {/* Site card per mockup: rounded-card, shadow-soft, image cover */}
              <Card
                hoverable
                onClick={() => handleSiteClick(site.id)}
                style={{
                  height: '100%',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: 'none',
                  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                }}
                styles={{
                  body: { padding: 24 },
                  cover: { margin: 0 },
                }}
                cover={
                  <div style={{
                    height: 192,
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#f3f4f6',
                  }}>
                    <SiteMapThumbnail
                      latitude={site.latitude}
                      longitude={site.longitude}
                      width={400}
                      height={192}
                      zoom={13}
                    />
                    {/* Status indicator per mockup */}
                    <div style={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      background: 'rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(4px)',
                      padding: 6,
                      borderRadius: 9999,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}>
                      <span style={{
                        display: 'block',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#22c55e', // green-500
                      }} />
                    </div>
                  </div>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Site name and subtitle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <Title
                        level={4}
                        style={{
                          margin: 0,
                          fontSize: 20,
                          fontWeight: 700,
                          color: colors.brownBramble,
                        }}
                      >
                        {site.name}
                      </Title>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#9c8749',
                        marginTop: 6,
                        display: 'block',
                      }}>
                        Last inspected 2 days ago
                      </Text>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 9999,
                        color: '#d1d5db',
                      }}
                    >
                      <span className="material-symbols-outlined">more_horiz</span>
                    </button>
                  </div>

                  {/* Stats row per mockup */}
                  <div style={{
                    display: 'flex',
                    gap: 12,
                    paddingTop: 16,
                    borderTop: '1px solid #f3f4f6',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#fafaf9',
                      color: colors.brownBramble,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#d97706' }}>
                        grid_view
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>2 Units</span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#fafaf9',
                      color: colors.brownBramble,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>
                        hive
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>8 Hives</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default Sites;
