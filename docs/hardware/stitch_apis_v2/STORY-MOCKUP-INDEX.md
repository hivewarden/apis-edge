# APIS Story-to-Mockup Index

> Maps each implementation story to relevant mockup files from `stitch_apis_v2/`

**Mockup Location**: `/docs/hardware/stitch_apis_v2/{mockup_name}/`
- `screen.png` - Visual screenshot
- `code.html` - HTML/Tailwind implementation reference

---

## Epic 1: Portal Foundation & Authentication

### Story 1.1: Project Scaffolding & Docker Compose
**Mockups**: None (infrastructure only)

### Story 1.2: Ant Design Theme Configuration
**Mockups**:
- `apis_button_system/` - Button styles and variants
- `apis_form_components/` - Form input styling

**Design Key Reference**: Color palette, typography, border-radius

### Story 1.3: Sidebar Layout & Navigation Shell
**Mockups**:
- `apis_desktop_sidebar_1/` ⭐ - Primary desktop sidebar
- `apis_desktop_sidebar_2/` - Alternative sidebar variant
- `apis_mobile_bottom_nav/` ⭐ - Mobile bottom navigation
- `apis_mobile_anchor_nav/` - Mobile anchor navigation

### Story 1.4: Zitadel OIDC Integration
**Mockups**:
- `apis_local_login/` ⭐ - Local authentication login
- `apis_sso_login/` - SSO login variant

### Story 1.5: Tenant Context & Database Setup
**Mockups**: None (backend only)

### Story 1.6: Health Endpoint & Deployment Verification
**Mockups**: None (backend only)

---

## Epic 2: Site & Unit Management

### Story 2.1: Create and Manage Sites
**Mockups**:
- `apis_sites_overview/` ⭐ - Sites list page
- `apis_add_site_form/` ⭐ - Site creation form
- `apis_site_details/` - Site detail view

### Story 2.2: Register APIS Units
**Mockups**:
- `apis_units_overview/` ⭐ - Units list page
- `apis_unit_card_component/` - Unit card design
- `apis_register_unit_modal/` ⭐ - Unit registration modal
- `apis_unit_details/` - Unit detail view

### Story 2.3: Unit Heartbeat Reception
**Mockups**: None (backend only)

### Story 2.4: Unit Status Dashboard Cards
**Mockups**:
- `apis_unit_card_component/` ⭐ - Unit status card
- `apis_dashboard_home/` - Dashboard with unit status

### Story 2.5: Live Video WebSocket Proxy
**Mockups**:
- `apis_live_stream_view/` ⭐ - Live stream viewer

---

## Epic 3: Hornet Detection Dashboard

### Story 3.1: Detection Events Table & API
**Mockups**:
- `apis_detection_card/` ⭐ - Detection event card

### Story 3.2: Today's Detection Count Card
**Mockups**:
- `apis_dashboard_home/` ⭐ - Dashboard with detection count
- `apis_detection_card/` - Detection summary

### Story 3.3: Weather Integration
**Mockups**:
- `apis_weather_card/` ⭐ - Weather display card
- `apis_dashboard_home/` - Dashboard with weather

### Story 3.4: Time Range Selector
**Mockups**:
- `apis_time_range_selector/` ⭐ - Time range UI component
- `apis_dashboard_home/` - Dashboard showing selector

### Story 3.5: Activity Clock Visualization
**Mockups**:
- `apis_dashboard_home/` ⭐ - Contains Activity Clock (polar chart)

### Story 3.6: Temperature Correlation Chart
**Mockups**:
- `apis_dashboard_home/` ⭐ - Contains correlation charts

### Story 3.7: Daily/Weekly Trend Line Chart
**Mockups**:
- `apis_dashboard_home/` ⭐ - Contains trend charts

---

## Epic 4: Clip Archive & Video Review

### Story 4.1: Clip Upload & Storage
**Mockups**: None (backend only)

### Story 4.2: Clip Archive List View
**Mockups**:
- `apis_clips_archive/` ⭐ - Clips list/grid view
- `apis_clip_card_detail/` - Clip thumbnail card

### Story 4.3: Clip Video Playback
**Mockups**:
- `apis_clip_review_player/` ⭐ - Video player modal

### Story 4.4: Clip Management (Delete/Archive)
**Mockups**:
- `apis_clips_archive/` - Clip management UI
- `apis_confirmation_modal/` ⭐ - Delete confirmation

### Story 4.5: Nest Radius Estimator Map
**Mockups**:
- `apis_nest_estimator/` ⭐ - Map-based estimator

---

## Epic 5: Hive Management & Inspections

### Story 5.1: Create and Configure Hives
**Mockups**:
- `apis_hives_overview/` ⭐ - Hives list page
- `apis_add_hive_form/` ⭐ - Hive creation form (with box builder)
- `apis_hive_qr_generator/` - QR code for hive

### Story 5.2: Hive List & Detail View
**Mockups**:
- `apis_hives_overview/` ⭐ - Hives grid/list
- `apis_hive_card_detail/` ⭐ - Hive detail card
- `apis_hive_detail_hub/` ⭐ - Full hive detail page
- `apis_mobile_hive_detail_scroll/` - Mobile hive detail

### Story 5.3: Quick-Entry Inspection Form
**Mockups**:
- `apis_mobile_inspection_flow/` ⭐ - Mobile inspection wizard
- `apis_inspection_history/` - Inspection list

### Story 5.4: Inspection History View
**Mockups**:
- `apis_inspection_history/` ⭐ - Inspection history list

### Story 5.5: Frame-Level Data Tracking
**Mockups**:
- `apis_mobile_inspection_flow/` - Frame entry in flow
- `apis_hive_development_chart/` - Frame data visualization

### Story 5.6: Frame Development Graphs
**Mockups**:
- `apis_hive_development_chart/` ⭐ - Development charts

---

## Epic 6: Treatments, Feedings & Harvests

### Story 6.1: Treatment Log
**Mockups**:
- `apis_treatment_log_form_1/` ⭐ - Treatment form step 1
- `apis_treatment_log_form_2/` - Treatment form step 2
- `apis_treatment_log_form_3/` - Treatment form step 3
- `apis_treatment_history/` ⭐ - Treatment history list

### Story 6.2: Feeding Log
**Mockups**:
- `apis_feeding_log_form/` ⭐ - Feeding entry form
- `apis_feeding_history/` ⭐ - Feeding history list

### Story 6.3: Harvest Tracking
**Mockups**:
- `apis_harvest_log_form/` ⭐ - Harvest entry form
- `apis_harvest_celebration/` - First harvest celebration

### Story 6.4: Equipment Log
**Mockups**:
- `apis_equipment_log_form/` ⭐ - Equipment entry form

### Story 6.5: Custom Labels System
**Mockups**: None specific (use form components patterns)

### Story 6.6: Treatment Calendar & Reminders
**Mockups**:
- `apis_treatment_history/` - Calendar reference
- `apis_overdue_alert_banner/` ⭐ - Reminder alerts

---

## Epic 7: Mobile PWA & Field Mode

### Story 7.1: Service Worker & App Shell Caching
**Mockups**: None (infrastructure only)

### Story 7.2: IndexedDB Offline Storage
**Mockups**: None (infrastructure only)

### Story 7.3: Offline Inspection Creation
**Mockups**:
- `apis_offline_mode_dashboard/` ⭐ - Offline dashboard state
- `apis_sync_status_header/` ⭐ - Sync status indicator

### Story 7.4: Automatic Background Sync
**Mockups**:
- `apis_sync_status_header/` ⭐ - Syncing state
- `apis_offline_mode_dashboard/` - Pending sync list

### Story 7.5: Voice Input for Notes
**Mockups**:
- `apis_voice_input_tool/` ⭐ - Voice input component

### Story 7.6: QR Code Hive Navigation
**Mockups**:
- `apis_qr_code_scanner/` ⭐ - QR scanner UI
- `apis_hive_qr_generator/` - QR generation

---

## Epic 8: BeeBrain AI Insights

### Story 8.1: BeeBrain Rule Engine MVP
**Mockups**: None (backend only)

### Story 8.2: Dashboard BeeBrain Card
**Mockups**:
- `apis_beebrain_dashboard_card/` ⭐ - AI insights card on dashboard
- `apis_dashboard_home/` - Shows AI insight placement

### Story 8.3: Hive Detail BeeBrain Analysis
**Mockups**:
- `apis_hive_ai_analysis/` ⭐ - Hive-specific AI analysis
- `apis_beebrain_mobile_suggestions/` - Mobile AI suggestions

### Story 8.4: Proactive Insight Notifications
**Mockups**:
- `apis_proactive_ai_insight/` ⭐ - Proactive insight banner
- `apis_toast_notifications/` - Toast notification patterns

### Story 8.5: Maintenance Priority View
**Mockups**:
- `apis_maintenance_priority_list/` ⭐ - Prioritized maintenance list

---

## Epic 9: Data Export & Emotional Moments

### Story 9.1: Configurable Data Export
**Mockups**:
- `apis_data_export_tool_1/` ⭐ - Export wizard step 1
- `apis_data_export_tool_2/` - Export wizard step 2
- `apis_data_export_tool_3/` - Export wizard step 3
- `apis_data_export_tool_4/` - Export wizard step 4
- `apis_data_export_tool_5/` - Export wizard step 5

### Story 9.2: First Harvest Celebration
**Mockups**:
- `apis_harvest_celebration/` ⭐ - Celebration modal with confetti

### Story 9.3: Hive Loss Post-Mortem
**Mockups**:
- `apis_hive_loss_support/` ⭐ - Loss support wizard

### Story 9.4: Season Recap Summary
**Mockups**:
- `apis_season_recap_card/` ⭐ - Season recap display

### Story 9.5: Overwintering Success Report
**Mockups**:
- `apis_overwintering_survey/` ⭐ - Overwintering survey/report

---

## Epic 10-12: Edge Device (No UI Mockups)

Epics 10-12 cover edge device firmware and hardware documentation - no dashboard mockups apply.

---

## Epic 13: Dual Auth Mode (New)

### Story 13.6: Retrofit Login Page
**Mockups**:
- `apis_local_login/` ⭐ - Local auth login
- `apis_sso_login/` - SSO login

### Story 13.11: User Management UI
**Mockups**: Use form patterns from `apis_form_components/`

### Story 13.12: Super Admin Tenant Management
**Mockups**:
- `apis_tenant_management/` ⭐ - Tenant list/management
- `apis_tenant_detail_view/` - Tenant detail

### Story 13.14: Super Admin Impersonation
**Mockups**:
- `apis_impersonation_mode/` ⭐ - Impersonation UI

### Story 13.15: Super Admin BeeBrain Config
**Mockups**:
- `apis_beebrain_system_config/` ⭐ - BeeBrain configuration

---

## Epic 14: Hive Task Management (New)

### Story 14.4: Portal Tasks Screen
**Mockups**:
- `apis_tasks_overview/` ⭐ - Tasks main screen
- `apis_active_tasks_list/` - Active tasks list
- `apis_expandable_task_card/` ⭐ - Task card component
- `apis_task_summary_status/` - Task status summary

### Story 14.X: Task Forms
**Mockups**:
- `apis_task_assignment_form/` ⭐ - Task assignment
- `apis_custom_task_template/` - Custom task templates
- `apis_mobile_inline_task_form/` - Mobile task entry
- `apis_task_completion_modal/` - Task completion
- `apis_mobile_completion_sheet/` - Mobile completion
- `apis_mobile_tasks_section/` - Mobile tasks section

---

## Shared Components (Cross-Story)

### Loading/Error/Empty States
- `apis_loading_state_preview/` - Loading skeletons
- `apis_error_state_preview/` - Error states
- `apis_empty_state_preview/` - Empty state illustrations

### Modals & Notifications
- `apis_confirmation_modal/` - Confirm/delete dialogs
- `apis_toast_notifications/` - Toast messages

### Setup Flows
- `apis_setup_-_account/` - Account setup
- `apis_setup_-_deployment/` - Deployment setup

### Untitled/Extra
- `untitled_screen_1/` through `untitled_screen_4/` - Review for additional patterns

---

## Quick Reference: Mockup Folders

| Folder | Primary Story | Component Type |
|--------|---------------|----------------|
| `apis_active_tasks_list` | 14.4 | Task list |
| `apis_add_hive_form` | 5.1 | Form |
| `apis_add_site_form` | 2.1 | Form |
| `apis_beebrain_dashboard_card` | 8.2 | Card |
| `apis_beebrain_mobile_suggestions` | 8.3 | Mobile card |
| `apis_beebrain_system_config` | 13.15 | Settings |
| `apis_button_system` | 1.2 | Theme |
| `apis_clip_card_detail` | 4.2 | Card |
| `apis_clip_review_player` | 4.3 | Modal |
| `apis_clips_archive` | 4.2 | Page |
| `apis_confirmation_modal` | Shared | Modal |
| `apis_custom_task_template` | 14.X | Form |
| `apis_dashboard_home` | 3.2, 3.5-3.7 | Page |
| `apis_data_export_tool_1-5` | 9.1 | Wizard |
| `apis_desktop_sidebar_1-2` | 1.3 | Layout |
| `apis_detection_card` | 3.1 | Card |
| `apis_empty_state_preview` | Shared | State |
| `apis_equipment_log_form` | 6.4 | Form |
| `apis_error_state_preview` | Shared | State |
| `apis_expandable_task_card` | 14.4 | Card |
| `apis_feeding_history` | 6.2 | List |
| `apis_feeding_log_form` | 6.2 | Form |
| `apis_form_components` | 1.2 | Theme |
| `apis_harvest_celebration` | 9.2 | Modal |
| `apis_harvest_log_form` | 6.3 | Form |
| `apis_hive_ai_analysis` | 8.3 | Card |
| `apis_hive_card_detail` | 5.2 | Card |
| `apis_hive_detail_hub` | 5.2 | Page |
| `apis_hive_development_chart` | 5.6 | Chart |
| `apis_hive_loss_support` | 9.3 | Wizard |
| `apis_hive_qr_generator` | 7.6 | Component |
| `apis_hives_overview` | 5.1, 5.2 | Page |
| `apis_impersonation_mode` | 13.14 | Banner |
| `apis_inspection_history` | 5.4 | List |
| `apis_live_stream_view` | 2.5 | Component |
| `apis_loading_state_preview` | Shared | State |
| `apis_local_login` | 1.4, 13.6 | Page |
| `apis_maintenance_priority_list` | 8.5 | List |
| `apis_mobile_anchor_nav` | 1.3 | Navigation |
| `apis_mobile_bottom_nav` | 1.3 | Navigation |
| `apis_mobile_completion_sheet` | 14.X | Modal |
| `apis_mobile_hive_detail_scroll` | 5.2 | Page |
| `apis_mobile_inline_task_form` | 14.X | Form |
| `apis_mobile_inspection_flow` | 5.3 | Wizard |
| `apis_mobile_tasks_section` | 14.4 | Section |
| `apis_nest_estimator` | 4.5 | Component |
| `apis_offline_mode_dashboard` | 7.3 | Page |
| `apis_overdue_alert_banner` | 6.6 | Banner |
| `apis_overwintering_survey` | 9.5 | Form |
| `apis_proactive_ai_insight` | 8.4 | Banner |
| `apis_qr_code_scanner` | 7.6 | Component |
| `apis_register_unit_modal` | 2.2 | Modal |
| `apis_season_recap_card` | 9.4 | Card |
| `apis_setup_-_account` | Setup | Page |
| `apis_setup_-_deployment` | Setup | Page |
| `apis_site_details` | 2.1 | Page |
| `apis_sites_overview` | 2.1 | Page |
| `apis_sso_login` | 1.4 | Page |
| `apis_sync_status_header` | 7.3, 7.4 | Component |
| `apis_task_assignment_form` | 14.X | Form |
| `apis_task_completion_modal` | 14.X | Modal |
| `apis_task_summary_status` | 14.4 | Card |
| `apis_tasks_overview` | 14.4 | Page |
| `apis_tenant_detail_view` | 13.12 | Page |
| `apis_tenant_management` | 13.12 | Page |
| `apis_time_range_selector` | 3.4 | Component |
| `apis_toast_notifications` | Shared | Component |
| `apis_treatment_history` | 6.1 | List |
| `apis_treatment_log_form_1-3` | 6.1 | Form |
| `apis_unit_card_component` | 2.2, 2.4 | Card |
| `apis_unit_details` | 2.2 | Page |
| `apis_units_overview` | 2.2 | Page |
| `apis_voice_input_tool` | 7.5 | Component |
| `apis_weather_card` | 3.3 | Card |
