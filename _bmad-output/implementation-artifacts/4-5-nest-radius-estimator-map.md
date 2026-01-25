# Story 4.5: Nest Radius Estimator Map

Status: done

## Story

As a **beekeeper**,
I want to estimate where the hornet nest might be located,
So that I can report it for destruction.

## Acceptance Criteria

1. **Given** I have a site with GPS coordinates, **When** I navigate to the site detail page, **Then** I see a map centered on my site location with a bee icon marker.

2. **Given** I have sufficient detection data (>20 detections), **When** the system calculates nest distance, **Then** it estimates flight distance based on visit patterns and displays a radius circle on the map.

3. **Given** the calculation completes, **When** I view the map, **Then** I see: circle radius (e.g., 350m), text "Nest likely within Xm based on Y observations", and confidence indicator.

4. **Given** insufficient data, **When** I view the Nest Estimator section, **Then** I see "Need more observations to estimate nest location" with progress: "X of 20 observations collected".

## Tasks / Subtasks

- [x] Task 1: Create backend nest estimate endpoint (AC: #2, #3, #4)
  - [x] 1.1 Add `GET /api/sites/{id}/nest-estimate` handler
  - [x] 1.2 Query detection count and time intervals
  - [x] 1.3 Calculate estimated radius from visit patterns
  - [x] 1.4 Return estimate data or insufficient data response

- [x] Task 2: Install and configure Leaflet (AC: #1)
  - [x] 2.1 Add react-leaflet and leaflet packages (v4.x for React 18 compatibility)
  - [x] 2.2 Import Leaflet CSS
  - [x] 2.3 Create basic map component wrapper

- [x] Task 3: Create NestEstimatorCard component (AC: #1, #2, #3, #4)
  - [x] 3.1 Create `apis-dashboard/src/components/NestEstimatorCard.tsx`
  - [x] 3.2 Display Leaflet map centered on site coordinates
  - [x] 3.3 Add marker at site location
  - [x] 3.4 Add circle overlay when estimate available
  - [x] 3.5 Show "insufficient data" state with progress bar

- [x] Task 4: Integrate with Dashboard (AC: #1)
  - [x] 4.1 Add NestEstimatorCard to Dashboard page
  - [x] 4.2 Pass site coordinates to component

## Dev Notes

### Backend Calculation

**Endpoint:** `GET /api/sites/{id}/nest-estimate`

**Response (sufficient data):**
```json
{
  "data": {
    "estimated_radius_m": 350,
    "observation_count": 42,
    "confidence": "medium",
    "avg_visit_interval_minutes": 12.5,
    "calculation_method": "visit_interval"
  }
}
```

**Response (insufficient data):**
```json
{
  "data": {
    "estimated_radius_m": null,
    "observation_count": 12,
    "confidence": null,
    "min_observations_required": 20,
    "message": "Need more observations to estimate nest location"
  }
}
```

**Calculation Logic:**
```go
// Hornet flight speed: ~22 km/h = 367 m/min
// Radius = (avg_visit_interval_minutes * flight_speed_m_per_min) / 2
// Division by 2: round trip (to nest and back)
const flightSpeedMPerMin = 367.0

func calculateNestRadius(avgIntervalMinutes float64) float64 {
    return (avgIntervalMinutes * flightSpeedMPerMin) / 2
}
```

**Confidence Levels:**
- High: >50 observations, consistent intervals
- Medium: 20-50 observations
- Low: Calculation available but low sample size

### Frontend Map Component

**Dependencies:**
```bash
npm install react-leaflet leaflet
npm install -D @types/leaflet
```

**NestEstimatorCard.tsx:**
```tsx
import { MapContainer, TileLayer, Marker, Circle, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface NestEstimatorCardProps {
  siteId: string;
  latitude: number;
  longitude: number;
}

function NestEstimatorCard({ siteId, latitude, longitude }: NestEstimatorCardProps) {
  const [estimate, setEstimate] = useState<NestEstimate | null>(null);

  useEffect(() => {
    fetchNestEstimate(siteId);
  }, [siteId]);

  return (
    <Card title="Nest Radius Estimator">
      <MapContainer center={[latitude, longitude]} zoom={14}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[latitude, longitude]} />
        {estimate?.estimated_radius_m && (
          <Circle
            center={[latitude, longitude]}
            radius={estimate.estimated_radius_m}
            color="orange"
            fillOpacity={0.2}
          />
        )}
      </MapContainer>
      {estimate?.estimated_radius_m ? (
        <p>Nest likely within {estimate.estimated_radius_m}m based on {estimate.observation_count} observations</p>
      ) : (
        <p>Need {20 - (estimate?.observation_count || 0)} more observations</p>
      )}
    </Card>
  );
}
```

### Leaflet Icon Fix

Leaflet icons need to be configured for webpack/vite:
```tsx
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
```

### References

- [Source: epics.md#Story-4.5] - Full acceptance criteria
- [Source: react-leaflet docs] - Map component setup
- [Source: architecture.md] - Frontend structure

### Dependencies

- react-leaflet v4.x
- leaflet v1.9.x
- Sites must have latitude/longitude set

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

None

### Completion Notes List

- Backend handler implements nest radius calculation using hornet flight speed (367 m/min) and visit interval averaging
- Radius capped between 50m and 2000m for reasonable values
- Confidence levels: high (>50 obs), medium (20-50 obs), low (<20 but calculable)
- Frontend uses react-leaflet v4.x (compatible with React 18)
- Map displays site marker and orange radius circle when estimate available
- Progress bar shown when insufficient observations (<20)
- Leaflet icon fix implemented for Vite bundler compatibility

### File List

- apis-server/internal/handlers/nest_estimate.go (created)
- apis-server/internal/storage/detections.go (modified - added GetNestEstimateStats)
- apis-server/cmd/server/main.go (modified - added route)
- apis-dashboard/src/components/NestEstimatorCard.tsx (created)
- apis-dashboard/src/components/index.ts (modified - added export)
- apis-dashboard/src/pages/Dashboard.tsx (modified - integrated NestEstimatorCard)
