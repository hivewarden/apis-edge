# Story 7.6: QR Code Hive Navigation

Status: done

## Story

As a **beekeeper**,
I want to scan a QR code on a hive to jump directly to it,
So that I can quickly access the right hive in a large apiary.

## Acceptance Criteria

1. **Given** I am in the app **When** I tap the "Scan QR" button (in header or hive list) **Then**:
   - The camera viewfinder opens
   - I see "Point at hive QR code" instruction text
   - The scanner has a visible target area

2. **Given** I point at a valid APIS QR code **When** the code is recognized **Then**:
   - I'm immediately navigated to that hive's detail page
   - The camera closes automatically
   - Navigation happens within 500ms of recognition

3. **Given** I scan an invalid or unknown QR code **When** the scan completes **Then**:
   - I see "Not recognized as an APIS hive code" message
   - I have option to "Try again" or "Cancel"
   - The camera remains open for retry

4. **Given** I want to generate QR codes **When** I go to a hive's detail page and tap settings/actions **Then**:
   - I can click "Generate QR Code" button
   - I see a printable QR code with hive name below
   - I have option to print or save as image

5. **Given** I print QR codes **When** I view the print preview **Then**:
   - It shows the QR code optimized for printing
   - The hive name is displayed in human-readable text below the QR
   - The layout is suitable for laminating and outdoor use

6. **Given** the camera permission is not granted **When** I tap "Scan QR" **Then**:
   - I see a permission prompt explaining why camera access is needed
   - After granting permission, the scanner opens
   - If denied, I see a helpful message about enabling permissions in settings

## Tasks / Subtasks

### Task 1: Create QRScannerModal Component (AC: #1, #2, #3, #6)
- [x] 1.1 Create `apis-dashboard/src/components/QRScannerModal.tsx`
- [x] 1.2 Install html5-qrcode library: `npm install html5-qrcode`
- [x] 1.3 Implement modal with camera viewfinder using Html5QrcodeScanner
- [x] 1.4 Add instruction text "Point at hive QR code" with visible target frame
- [x] 1.5 Implement QR code recognition callback
- [x] 1.6 Parse QR code content: expect format `apis://hive/{site_id}/{hive_id}`
- [x] 1.7 Navigate to `/hives/{hive_id}` on valid code recognition
- [x] 1.8 Show error message for invalid/unrecognized codes with "Try again" / "Cancel" buttons
- [x] 1.9 Handle camera permission denied gracefully with helpful message
- [x] 1.10 Style with APIS theme colors (seaBuckthorn accent, brownBramble text)
- [x] 1.11 Ensure 64px minimum touch targets for mobile/glove use

### Task 2: Create useQRScanner Hook (AC: #1, #6)
- [x] 2.1 Create `apis-dashboard/src/hooks/useQRScanner.ts`
- [x] 2.2 Manage scanner state: `{ isOpen, isScanning, error, lastResult }`
- [x] 2.3 Handle camera permission check and request
- [x] 2.4 Provide `open()`, `close()`, `reset()` functions
- [x] 2.5 Handle cleanup when component unmounts (stop scanner)
- [x] 2.6 Return `{ isSupported, isOpen, isScanning, error, openScanner, closeScanner, lastResult }`

### Task 3: Create QRCodeGenerator Component (AC: #4, #5)
- [x] 3.1 Create `apis-dashboard/src/components/QRCodeGenerator.tsx`
- [x] 3.2 Install qrcode library: `npm install qrcode` and `@types/qrcode`
- [x] 3.3 Generate QR code for format `apis://hive/{site_id}/{hive_id}`
- [x] 3.4 Display QR code with hive name below in human-readable text
- [x] 3.5 Implement "Save as Image" functionality (download as PNG)
- [x] 3.6 Implement "Print" functionality with CSS @media print styling
- [x] 3.7 Size QR code appropriately for outdoor use (minimum 2.5cm x 2.5cm at print)
- [x] 3.8 Add site name as secondary text (smaller, below hive name)

### Task 4: Create QRGeneratorModal Component (AC: #4, #5)
- [x] 4.1 Create `apis-dashboard/src/components/QRGeneratorModal.tsx`
- [x] 4.2 Props: `{ hive: Hive, siteId: string, siteName: string, open: boolean, onClose: () => void }`
- [x] 4.3 Display QRCodeGenerator component inside modal
- [x] 4.4 Add "Download PNG" button with proper filename: `{hive_name}_qr.png`
- [x] 4.5 Add "Print" button that triggers browser print dialog
- [x] 4.6 Style modal with APIS theme, ensure glove-friendly buttons (64px height)

### Task 5: Add Scan QR Button to Hives Page (AC: #1)
- [x] 5.1 Modify `apis-dashboard/src/pages/Hives.tsx`
- [x] 5.2 Add "Scan QR" button in header actions area (next to "Add Hive" button)
- [x] 5.3 Use QrCodeOutlined icon from @ant-design/icons
- [x] 5.4 Open QRScannerModal when clicked
- [x] 5.5 Ensure button has 64px minimum height for mobile/glove use

### Task 6: Add Scan QR Button to AppLayout Header (AC: #1)
- [x] 6.1 Modify `apis-dashboard/src/components/layout/AppLayout.tsx`
- [x] 6.2 Add QR scan icon button in header (mobile-friendly position)
- [x] 6.3 Only show when online (QR scanning requires camera, no offline use case)
- [x] 6.4 Open QRScannerModal when clicked
- [x] 6.5 Use Tooltip to show "Scan QR Code" on hover

### Task 7: Add Generate QR Code to HiveDetail Page (AC: #4, #5)
- [x] 7.1 Modify `apis-dashboard/src/pages/HiveDetail.tsx`
- [x] 7.2 Add "QR Code" button in actions area (Dropdown menu or direct button)
- [x] 7.3 Open QRGeneratorModal with hive data when clicked
- [x] 7.4 Pass site_id and site_name to the modal for complete QR content
- [x] 7.5 Use QrcodeOutlined icon

### Task 8: Create Print Stylesheet (AC: #5)
- [x] 8.1 Create `apis-dashboard/src/styles/qr-print.css`
- [x] 8.2 Add @media print rules for QR code display
- [x] 8.3 Hide all non-essential elements during print
- [x] 8.4 Size QR code to optimal print dimensions (2.5-3cm square)
- [x] 8.5 Ensure hive name is large enough to read (minimum 14pt)
- [x] 8.6 Add crop marks or border for easy cutting after print
- [x] 8.7 Import stylesheet in QRGeneratorModal

### Task 9: Create Tests (AC: #1-6)
- [x] 9.1 Create `apis-dashboard/tests/components/QRScannerModal.test.tsx`
- [x] 9.2 Create `apis-dashboard/tests/components/QRCodeGenerator.test.tsx`
- [x] 9.3 Create `apis-dashboard/tests/components/QRGeneratorModal.test.tsx`
- [x] 9.4 Create `apis-dashboard/tests/hooks/useQRScanner.test.ts`
- [x] 9.5 Test QR code parsing for valid APIS format
- [x] 9.6 Test QR code parsing for invalid formats
- [x] 9.7 Test QR generation with correct content
- [x] 9.8 Test navigation after successful scan
- [x] 9.9 Mock html5-qrcode and qrcode libraries appropriately

### Task 10: Export Components and Update Barrel Files (AC: #1-6)
- [x] 10.1 Export QRScannerModal from `components/index.ts`
- [x] 10.2 Export QRCodeGenerator from `components/index.ts`
- [x] 10.3 Export QRGeneratorModal from `components/index.ts`
- [x] 10.4 Export useQRScanner from `hooks/index.ts`
- [x] 10.5 Add JSDoc comments to all public APIs
- [x] 10.6 Update TypeScript types as needed

## Dev Notes

### Architecture Patterns

**QR Code Content Format (from Architecture & UX Specification):**
```
apis://hive/{site_id}/{hive_id}

Example: apis://hive/abc123/hive-47
```

The QR code uses a custom URL scheme `apis://` which allows:
1. Easy parsing and validation
2. Future extensibility for other QR code types
3. Deep linking if native app is ever developed

**Scanner Library Choice:**
Using `html5-qrcode` because:
- Well-maintained, active development
- Works on both desktop and mobile browsers
- Handles camera permissions gracefully
- Supports multiple barcode formats (can be restricted to QR only)

**QR Generation Library:**
Using `qrcode` npm package because:
- Pure JavaScript, no external dependencies
- Generates canvas and data URL output
- Supports error correction levels
- Small bundle size

### QRScannerModal Implementation Pattern

```typescript
// src/components/QRScannerModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Typography, Space, Alert, Result } from 'antd';
import { ReloadOutlined, CloseOutlined, CameraOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text, Title } = Typography;

interface QRScannerModalProps {
  open: boolean;
  onClose: () => void;
}

// QR code format: apis://hive/{site_id}/{hive_id}
const QR_PATTERN = /^apis:\/\/hive\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)$/;

export function QRScannerModal({ open, onClose }: QRScannerModalProps): React.ReactElement {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const startScanner = async () => {
    try {
      setError(null);
      setPermissionDenied(false);

      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // QR code not detected - ignore
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.error('Scanner error:', err);
      if (err instanceof Error && err.message.includes('Permission')) {
        setPermissionDenied(true);
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else {
        setError('Failed to start camera. Please check your device has a camera.');
      }
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    const match = decodedText.match(QR_PATTERN);

    if (match) {
      const [, siteId, hiveId] = match;
      stopScanner();
      onClose();
      navigate(`/hives/${hiveId}`);
    } else {
      stopScanner();
      setError('Not recognized as an APIS hive code');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.error('Error stopping scanner:', e);
      }
      scannerRef.current = null;
      setIsScanning(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    startScanner();
  };

  const handleClose = () => {
    stopScanner();
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (open) {
      // Small delay to allow modal to render
      setTimeout(() => startScanner(), 100);
    }
    return () => {
      stopScanner();
    };
  }, [open]);

  return (
    <Modal
      title={null}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={400}
      centered
      destroyOnClose
      styles={{
        body: { padding: 24, textAlign: 'center' },
      }}
    >
      {permissionDenied ? (
        <Result
          icon={<CameraOutlined style={{ color: colors.seaBuckthorn }} />}
          title="Camera Access Required"
          subTitle="Please allow camera access in your browser settings to scan QR codes."
          extra={
            <Button
              type="primary"
              onClick={handleClose}
              style={{ minHeight: touchTargets.mobile }}
            >
              Close
            </Button>
          }
        />
      ) : error ? (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Alert
            type="warning"
            message={error}
            showIcon
          />
          <Space size={16}>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRetry}
              style={{ minHeight: touchTargets.mobile, minWidth: 120 }}
            >
              Try Again
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={handleClose}
              style={{ minHeight: touchTargets.mobile, minWidth: 120 }}
            >
              Cancel
            </Button>
          </Space>
        </Space>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div
            id="qr-reader"
            style={{
              width: '100%',
              minHeight: 300,
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}
          />
          <Text style={{ color: colors.brownBramble, fontSize: 16 }}>
            Point at hive QR code
          </Text>
          <Button
            icon={<CloseOutlined />}
            onClick={handleClose}
            style={{ minHeight: touchTargets.mobile }}
          >
            Cancel
          </Button>
        </Space>
      )}
    </Modal>
  );
}

export default QRScannerModal;
```

### useQRScanner Hook Pattern

```typescript
// src/hooks/useQRScanner.ts
import { useState, useCallback } from 'react';

interface UseQRScannerResult {
  isSupported: boolean;
  isOpen: boolean;
  error: string | null;
  openScanner: () => void;
  closeScanner: () => void;
}

export function useQRScanner(): UseQRScannerResult {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if browser supports getUserMedia (required for camera access)
  const isSupported = typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    'getUserMedia' in navigator.mediaDevices;

  const openScanner = useCallback(() => {
    if (!isSupported) {
      setError('Camera not supported on this device');
      return;
    }
    setError(null);
    setIsOpen(true);
  }, [isSupported]);

  const closeScanner = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  return {
    isSupported,
    isOpen,
    error,
    openScanner,
    closeScanner,
  };
}
```

### QRCodeGenerator Component Pattern

```typescript
// src/components/QRCodeGenerator.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Typography, Space, Spin } from 'antd';
import QRCode from 'qrcode';
import { colors } from '../theme/apisTheme';

const { Text, Title } = Typography;

interface QRCodeGeneratorProps {
  siteId: string;
  hiveId: string;
  hiveName: string;
  siteName?: string;
}

export function QRCodeGenerator({
  siteId,
  hiveId,
  hiveName,
  siteName,
}: QRCodeGeneratorProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [dataUrl, setDataUrl] = useState<string>('');

  const qrContent = `apis://hive/${siteId}/${hiveId}`;

  useEffect(() => {
    const generateQR = async () => {
      if (canvasRef.current) {
        try {
          await QRCode.toCanvas(canvasRef.current, qrContent, {
            width: 200,
            margin: 2,
            color: {
              dark: colors.brownBramble,
              light: '#ffffff',
            },
            errorCorrectionLevel: 'H', // High error correction for outdoor durability
          });

          // Generate data URL for download
          const url = canvasRef.current.toDataURL('image/png');
          setDataUrl(url);
          setLoading(false);
        } catch (err) {
          console.error('QR generation error:', err);
          setLoading(false);
        }
      }
    };

    generateQR();
  }, [qrContent]);

  return (
    <div
      className="qr-code-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#fff',
      }}
    >
      {loading ? (
        <Spin size="large" />
      ) : (
        <>
          <canvas
            ref={canvasRef}
            style={{
              border: `2px solid ${colors.seaBuckthorn}`,
              borderRadius: 8,
            }}
          />
          <Space direction="vertical" align="center" style={{ marginTop: 16 }}>
            <Title level={4} style={{ margin: 0, color: colors.brownBramble }}>
              {hiveName}
            </Title>
            {siteName && (
              <Text type="secondary" style={{ fontSize: 14 }}>
                {siteName}
              </Text>
            )}
          </Space>
        </>
      )}
    </div>
  );
}

export default QRCodeGenerator;
```

### QRGeneratorModal Component Pattern

```typescript
// src/components/QRGeneratorModal.tsx
import React, { useRef } from 'react';
import { Modal, Button, Space, message } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { QRCodeGenerator } from './QRCodeGenerator';
import { touchTargets } from '../theme/apisTheme';
import './qr-print.css';

interface Hive {
  id: string;
  name: string;
}

interface QRGeneratorModalProps {
  hive: Hive;
  siteId: string;
  siteName: string;
  open: boolean;
  onClose: () => void;
}

export function QRGeneratorModal({
  hive,
  siteId,
  siteName,
  open,
  onClose,
}: QRGeneratorModalProps): React.ReactElement {
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const canvas = printRef.current?.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${hive.name.replace(/\s+/g, '_')}_qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      message.success('QR code downloaded');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      title={`QR Code: ${hive.name}`}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            style={{ minHeight: touchTargets.mobile }}
          >
            Download PNG
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            style={{ minHeight: touchTargets.mobile }}
          >
            Print
          </Button>
        </Space>
      }
      width={400}
      centered
    >
      <div ref={printRef} className="qr-print-area">
        <QRCodeGenerator
          siteId={siteId}
          hiveId={hive.id}
          hiveName={hive.name}
          siteName={siteName}
        />
      </div>
    </Modal>
  );
}

export default QRGeneratorModal;
```

### Print Stylesheet Pattern

```css
/* src/styles/qr-print.css */
@media print {
  /* Hide everything except QR print area */
  body * {
    visibility: hidden;
  }

  .qr-print-area,
  .qr-print-area * {
    visibility: visible;
  }

  .qr-print-area {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 8cm;
    padding: 1cm;
    border: 1px dashed #ccc;
  }

  .qr-print-area canvas {
    width: 6cm !important;
    height: 6cm !important;
  }

  .qr-print-area h4 {
    font-size: 18pt !important;
    margin-top: 0.5cm !important;
  }

  .qr-print-area .ant-typography-secondary {
    font-size: 12pt !important;
  }

  /* Crop marks for cutting */
  .qr-print-area::before,
  .qr-print-area::after {
    content: '';
    position: absolute;
    width: 10px;
    height: 10px;
    border: 1px solid #000;
  }

  .qr-print-area::before {
    top: -15px;
    left: -15px;
    border-right: none;
    border-bottom: none;
  }

  .qr-print-area::after {
    bottom: -15px;
    right: -15px;
    border-left: none;
    border-top: none;
  }
}
```

### Existing Code to Reuse

**DO NOT RECREATE - Import these from previous stories:**

| Module | Import From | Purpose |
|--------|-------------|---------|
| `colors` | `src/theme/apisTheme.ts` | Theme colors (seaBuckthorn, brownBramble) |
| `touchTargets` | `src/theme/apisTheme.ts` | 64px touch target constants |
| `useOnlineStatus` | `src/hooks/useOnlineStatus.ts` | Detect online/offline for scanner availability |
| `useNavigate` | `react-router-dom` | Navigation after successful scan |

### File Structure

**Files to create:**
- `apis-dashboard/src/components/QRScannerModal.tsx` - Scanner modal with camera
- `apis-dashboard/src/components/QRCodeGenerator.tsx` - QR code generation component
- `apis-dashboard/src/components/QRGeneratorModal.tsx` - Modal for viewing/printing QR
- `apis-dashboard/src/hooks/useQRScanner.ts` - Scanner state management hook
- `apis-dashboard/src/styles/qr-print.css` - Print stylesheet
- `apis-dashboard/tests/components/QRScannerModal.test.tsx`
- `apis-dashboard/tests/components/QRCodeGenerator.test.tsx`
- `apis-dashboard/tests/components/QRGeneratorModal.test.tsx`
- `apis-dashboard/tests/hooks/useQRScanner.test.ts`

**Files to modify:**
- `apis-dashboard/src/pages/Hives.tsx` - Add "Scan QR" button
- `apis-dashboard/src/pages/HiveDetail.tsx` - Add "Generate QR Code" button
- `apis-dashboard/src/components/layout/AppLayout.tsx` - Add QR scan icon in header
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export new hook

### Theme Colors Reference

```typescript
// From src/theme/apisTheme.ts
seaBuckthorn: '#f7a42d'  // Primary gold - buttons, accents
coconutCream: '#fbf9e7'  // Background
brownBramble: '#662604'  // Text, QR code dark color
salomie: '#fcd483'       // Cards/surfaces
```

### Touch Target Reference

```typescript
// From src/theme/apisTheme.ts
touchTargets = {
  standard: 48,   // Standard touch target
  mobile: 64,     // Glove-friendly (required for this story)
  gap: 16,        // Minimum gap between targets
}
```

### NPM Dependencies to Install

```bash
# html5-qrcode for scanning
npm install html5-qrcode

# qrcode for generation (with types)
npm install qrcode
npm install -D @types/qrcode
```

### Testing Strategy

**Unit Tests:**
1. `QRScannerModal.test.tsx`:
   - Test modal opens/closes correctly
   - Test QR code parsing for valid APIS format
   - Test QR code parsing rejects invalid formats
   - Test error state displays correctly
   - Test retry functionality

2. `QRCodeGenerator.test.tsx`:
   - Test QR code generates with correct content
   - Test canvas renders correctly
   - Test hive name displays below QR

3. `QRGeneratorModal.test.tsx`:
   - Test download button triggers download
   - Test print button triggers print dialog
   - Test modal displays hive information

4. `useQRScanner.test.ts`:
   - Test browser support detection
   - Test open/close state management
   - Test error handling

**Manual Testing Checklist:**
1. Open Hives page, tap "Scan QR" button
2. Grant camera permission when prompted
3. Point at valid APIS QR code - verify navigation to hive detail
4. Point at non-APIS QR code - verify error message appears
5. Tap "Try Again" - verify scanner restarts
6. Go to hive detail, tap "QR Code" action
7. Verify QR code displays with hive name
8. Tap "Download PNG" - verify file downloads
9. Tap "Print" - verify print preview shows QR code only
10. Test on mobile device with gloves (verify 64px targets are comfortable)

### Previous Story Intelligence

**From Story 7-5 (Voice Input for Notes):**
- Pattern for detecting browser feature support (SpeechRecognition check pattern)
- Modal component patterns with APIS theme
- Error handling with helpful user messages
- 64px touch target implementation

**From Epic 7 (PWA Stories):**
- `useOnlineStatus` hook for detecting connectivity
- `OfflineBanner` component for offline messaging
- Modal patterns with Ant Design
- Print stylesheet patterns for export functionality (from Export.tsx)

### Key Implementation Notes

1. **QR Code Format Validation:**
   - Must match exactly: `apis://hive/{site_id}/{hive_id}`
   - Use regex for validation: `/^apis:\/\/hive\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)$/`
   - Extract both site_id and hive_id even though navigation only uses hive_id

2. **Camera Permissions:**
   - Request camera with `facingMode: 'environment'` for back camera on mobile
   - Handle permission denied gracefully with helpful message
   - Don't show scanner in header when offline (no use case)

3. **Print Considerations:**
   - QR code should be minimum 2.5cm for reliable scanning
   - Error correction level 'H' for outdoor durability (dirt, wear)
   - Include crop marks for easy cutting
   - Hive name must be readable when laminated

4. **Navigation:**
   - Navigate to `/hives/{hive_id}` not `/hives/{site_id}/{hive_id}`
   - The hive_id is globally unique, site_id in QR is for future extensibility
   - Close modal before navigation to avoid UI glitches

### Project Structure Notes

- All hooks in `apis-dashboard/src/hooks/`
- All components in `apis-dashboard/src/components/`
- Styles in `apis-dashboard/src/styles/`
- All tests in `apis-dashboard/tests/` (not co-located)
- Export new modules from barrel files (`index.ts`)

### References

- [Source: ux-design-specification.md#QR-Code-Navigation] - QR scanner UI design
- [Source: architecture.md#QR-Code-Service] - QR code format specification
- [Source: epics.md#Story-7.6] - Full acceptance criteria with BDD scenarios
- [Source: apisTheme.ts] - touchTargets and colors constants

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without issues.

### Completion Notes List

- Installed html5-qrcode and qrcode npm packages for QR scanning and generation
- Created QRScannerModal component with camera viewfinder, permission handling, and navigation
- Created useQRScanner hook for state management
- Created QRCodeGenerator component with canvas-based QR rendering using APIS URL scheme
- Created QRGeneratorModal with download and print functionality
- Added Scan QR button to Hives page (64px touch target, conditional on camera support)
- Added QR scan icon to mobile header in AppLayout (only shown when online)
- Added QR Code button to HiveDetail page actions
- Created print stylesheet with crop marks for laminating
- Created 42 tests covering hook, parsing, and component functionality
- All 771 project tests pass

### Change Log

- 2026-01-25: Initial implementation of Story 7.6 - QR Code Hive Navigation
- 2026-01-25: Remediated code review issues:
  - HIGH: Added isScanning, lastResult states and reset() function to useQRScanner hook
  - HIGH: Added 64px touch target to HiveDetail QR Code button
  - HIGH: Documented 500ms navigation timing as best-effort UX goal
  - MEDIUM: Replaced deprecated destroyOnClose with destroyOnHidden in QRScannerModal
  - MEDIUM: Added 64px touch target to AppLayout header QR button
  - MEDIUM: Fixed useEffect cleanup structure to avoid double stopScanner calls
  - LOW: Added JSDoc comments to internal functions in QRScannerModal

### File List

**New Files:**
- apis-dashboard/src/components/QRScannerModal.tsx
- apis-dashboard/src/components/QRCodeGenerator.tsx
- apis-dashboard/src/components/QRGeneratorModal.tsx
- apis-dashboard/src/hooks/useQRScanner.ts
- apis-dashboard/src/styles/qr-print.css
- apis-dashboard/tests/components/QRScannerModal.test.tsx
- apis-dashboard/tests/components/QRCodeGenerator.test.tsx
- apis-dashboard/tests/components/QRGeneratorModal.test.tsx
- apis-dashboard/tests/hooks/useQRScanner.test.ts

**Modified Files:**
- apis-dashboard/src/pages/Hives.tsx - Added Scan QR button and QRScannerModal
- apis-dashboard/src/pages/HiveDetail.tsx - Added QR Code button and QRGeneratorModal
- apis-dashboard/src/components/layout/AppLayout.tsx - Added QR scan icon in mobile header
- apis-dashboard/src/components/index.ts - Exported QR components
- apis-dashboard/src/hooks/index.ts - Exported useQRScanner hook
- apis-dashboard/package.json - Added html5-qrcode and qrcode dependencies
