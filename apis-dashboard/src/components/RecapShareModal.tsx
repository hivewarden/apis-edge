/**
 * RecapShareModal Component
 *
 * Modal with share options for season recap: Text, Image, PDF.
 * Supports clipboard copy, canvas-based image download, and print/PDF.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import React, { useState, useRef } from 'react';
import {
  Modal,
  Tabs,
  Button,
  Typography,
  message,
  Space,
  Spin,
  Alert,
} from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  PrinterOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import html2canvas from 'html2canvas';
import { SeasonRecap, getRecapText } from '../hooks/useSeasonRecap';
import { SeasonRecapCard } from './SeasonRecapCard';
import { colors } from '../theme/apisTheme';

const { Text, Paragraph } = Typography;

export interface RecapShareModalProps {
  open: boolean;
  onClose: () => void;
  recap: SeasonRecap;
}

/**
 * RecapShareModal provides sharing options for the season recap.
 */
export function RecapShareModal({ open, onClose, recap }: RecapShareModalProps) {
  const [activeTab, setActiveTab] = useState('text');
  const [textCopied, setTextCopied] = useState(false);
  const [recapText, setRecapText] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Load text when tab changes to text
  const handleTabChange = async (key: string) => {
    setActiveTab(key);
    if (key === 'text' && !recapText) {
      setLoadingText(true);
      try {
        const text = await getRecapText(recap.season_year, recap.hemisphere);
        setRecapText(text);
      } catch (err) {
        message.error('Failed to load text version');
      } finally {
        setLoadingText(false);
      }
    }
  };

  // Copy text to clipboard
  const handleCopyText = async () => {
    if (!recapText) return;

    try {
      await navigator.clipboard.writeText(recapText);
      setTextCopied(true);
      message.success('Copied to clipboard!');
      setTimeout(() => setTextCopied(false), 3000);
    } catch (err) {
      message.error('Failed to copy to clipboard');
    }
  };

  // Download as image
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;

    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: colors.coconutCream,
        scale: 2, // High DPI
        useCORS: true,
        logging: false,
      });

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          message.error('Failed to generate image');
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `apis-season-recap-${recap.season_year}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        message.success('Image downloaded!');
      }, 'image/png');
    } catch (err) {
      message.error('Failed to generate image');
    } finally {
      setDownloading(false);
    }
  };

  // Print / PDF
  const handlePrint = () => {
    window.print();
  };

  const tabItems = [
    {
      key: 'text',
      label: 'Copy Text',
      children: (
        <div>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Copy this formatted text to share on social media, forums, or messaging apps.
          </Paragraph>

          {loadingText ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : (
            <>
              <div
                style={{
                  background: colors.coconutCream,
                  padding: 16,
                  borderRadius: 8,
                  border: `1px solid ${colors.seaBuckthorn}40`,
                  maxHeight: 300,
                  overflow: 'auto',
                  marginBottom: 16,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  fontSize: 13,
                }}
              >
                {recapText || 'Loading...'}
              </div>

              <Button
                type="primary"
                icon={textCopied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={handleCopyText}
                disabled={!recapText}
                style={{ width: '100%' }}
              >
                {textCopied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'image',
      label: 'Download Image',
      children: (
        <div>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Download a shareable card image of your season recap.
          </Paragraph>

          <div
            style={{
              border: `1px solid ${colors.seaBuckthorn}40`,
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            <SeasonRecapCard ref={cardRef} recap={recap} compact />
          </div>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadImage}
            loading={downloading}
            style={{ width: '100%' }}
          >
            Download as PNG
          </Button>
        </div>
      ),
    },
    {
      key: 'pdf',
      label: 'Print / PDF',
      children: (
        <div>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Print or save as PDF using your browser's print dialog.
          </Paragraph>

          <Alert
            type="info"
            message="Tip"
            description="In the print dialog, select 'Save as PDF' to create a PDF file instead of printing."
            style={{ marginBottom: 16 }}
          />

          <div style={{ marginBottom: 16 }}>
            <Text strong>Print includes:</Text>
            <ul style={{ marginTop: 8 }}>
              <li>Season summary card</li>
              <li>All statistics</li>
              <li>Per-hive breakdown table</li>
              <li>Milestones and highlights</li>
            </ul>
          </div>

          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            style={{ width: '100%' }}
          >
            Open Print Dialog
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title="Share Season Recap"
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
      />
    </Modal>
  );
}

export default RecapShareModal;
