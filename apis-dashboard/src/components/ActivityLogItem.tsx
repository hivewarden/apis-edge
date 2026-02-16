/**
 * ActivityLogItem - Component for displaying activity log entries
 *
 * Story 14.13: Task Completion Inspection Note Logging
 * Displays task completion activity with auto-applied badge and expandable details.
 */
import { useState } from "react";
import { Space, Tag, Typography } from "antd";
import {
  RobotOutlined,
  CheckCircleOutlined,
  DownOutlined,
  RightOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ActivityLogEntry } from "../hooks/useHiveActivity";
import { colors } from "../theme/apisTheme";

const { Text } = Typography;

interface ActivityLogItemProps {
  entry: ActivityLogEntry;
}

/**
 * Displays a single activity log entry with expandable details.
 *
 * Features:
 * - Robot icon and "Auto-updated" badge when auto_applied is true
 * - Check icon for regular task completions
 * - Expandable section showing changes made
 * - Styled differently from inspection rows
 */
export function ActivityLogItem({ entry }: ActivityLogItemProps) {
  const [expanded, setExpanded] = useState(false);

  const metadata = entry.metadata;
  const isAutoApplied = metadata?.auto_applied === true;
  const hasChanges = metadata?.changes && metadata.changes.length > 0;
  const hasNotes = !!metadata?.notes;
  const isExpandable = hasChanges || hasNotes;

  const taskName = metadata?.task_name || "Task";
  const formattedDate = dayjs(entry.created_at).format("MMM D, YYYY");
  const formattedTime = dayjs(entry.created_at).format("h:mm A");

  return (
    <div style={styles.container}>
      <div
        style={styles.header}
        onClick={() => isExpandable && setExpanded(!expanded)}
        role={isExpandable ? "button" : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        onKeyDown={(e) => {
          if (isExpandable && (e.key === "Enter" || e.key === " ")) {
            setExpanded(!expanded);
          }
        }}
      >
        <Space size={12} align="center">
          {/* Icon based on auto-applied status */}
          {isAutoApplied ? (
            <RobotOutlined style={styles.iconAuto} />
          ) : (
            <CheckCircleOutlined style={styles.iconManual} />
          )}

          {/* Date and time */}
          <div style={styles.dateTime}>
            <Text style={styles.date}>{formattedDate}</Text>
            <Text style={styles.time}>{formattedTime}</Text>
          </div>

          {/* Task name */}
          <Text style={styles.taskName}>{taskName}</Text>

          {/* Auto-updated badge */}
          {isAutoApplied && (
            <Tag color="processing" style={styles.autoTag}>
              Auto-updated
            </Tag>
          )}
        </Space>

        {/* Expand indicator */}
        {isExpandable && (
          <span style={styles.expandIcon}>
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </span>
        )}
      </div>

      {/* Expandable content */}
      {isExpandable && expanded && (
        <div style={styles.expandedContent}>
          {/* Changes list */}
          {hasChanges && (
            <div style={styles.changesSection}>
              <Text style={styles.changesLabel}>Changes made:</Text>
              <ul style={styles.changesList}>
                {metadata!.changes!.map((change, index) => (
                  <li key={index} style={styles.changeItem}>
                    <Text style={styles.changeText}>{change}</Text>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          {hasNotes && (
            <div style={styles.notesSection}>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.notesText}>{metadata!.notes}</Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderLeft: `3px solid ${colors.brownBramble}`,
    backgroundColor: "rgba(102, 38, 4, 0.03)",
    borderRadius: "0 8px 8px 0",
    marginBottom: 8,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  iconAuto: {
    fontSize: 16,
    color: colors.seaBuckthorn,
  },
  iconManual: {
    fontSize: 16,
    color: colors.success,
  },
  dateTime: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.2,
  },
  date: {
    fontSize: 13,
    color: colors.brownBramble,
    fontWeight: 500,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
  },
  taskName: {
    fontSize: 13,
    color: colors.brownBramble,
  },
  autoTag: {
    fontSize: 11,
    padding: "0 6px",
    marginLeft: 4,
  },
  expandIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  expandedContent: {
    padding: "0 14px 12px 48px",
    backgroundColor: "rgba(102, 38, 4, 0.02)",
  },
  changesSection: {
    marginBottom: 8,
  },
  changesLabel: {
    fontSize: 12,
    color: colors.textMuted,
    display: "block",
    marginBottom: 4,
  },
  changesList: {
    margin: "0 0 0 16px",
    padding: 0,
    listStyleType: "disc",
  },
  changeItem: {
    marginBottom: 2,
  },
  changeText: {
    fontSize: 12,
    color: colors.brownBramble,
  },
  notesSection: {
    marginTop: 8,
  },
  notesLabel: {
    fontSize: 12,
    color: colors.textMuted,
    display: "block",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 12,
    color: colors.brownBramble,
    fontStyle: "italic",
  },
};

export default ActivityLogItem;
