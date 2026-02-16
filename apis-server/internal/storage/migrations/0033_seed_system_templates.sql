-- Migration: 0033_seed_system_templates.sql
-- Seeds system task templates with complete auto_effects JSON.
--
-- System templates are available to all tenants (tenant_id = NULL, is_system = TRUE).
-- Each template defines:
--   - prompts[]: User inputs required when completing the task
--   - updates[]: Hive fields to update on task completion
--   - creates[]: Records to create (feeding, treatment, harvest)
--
-- Uses ON CONFLICT DO NOTHING for idempotency (safe to re-run).
--
-- Epic: 14 - Hive Task Management
-- Story: 14.1 - Database Migrations + System Template Seeding

-- 1. Requeen template
-- Prompts for queen marking color and source, updates queen_introduced_at and queen_source on hive
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-requeen',
    NULL,
    'requeen',
    'Requeen',
    'Replace or introduce a new queen. Records queen year and marking color.',
    '{
        "prompts": [
            {
                "key": "color",
                "label": "Queen marking color",
                "type": "select",
                "options": ["white", "yellow", "red", "green", "blue", "unmarked"],
                "required": false
            },
            {
                "key": "source",
                "label": "Queen source",
                "type": "text",
                "placeholder": "e.g., Local breeder, purchased, swarm cell",
                "required": false
            }
        ],
        "updates": [
            {
                "target": "hive.queen_introduced_at",
                "action": "set",
                "value": "{{current_date}}"
            },
            {
                "target": "hive.queen_source",
                "action": "set",
                "value_from": "completion_data.source"
            }
        ],
        "creates": []
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 2. Add frame template
-- No auto-effects - frame tracking is done via inspection records
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-add-frame',
    NULL,
    'add_frame',
    'Add frame',
    'Add one or more frames to the hive. Frame count is tracked via inspections.',
    '{
        "prompts": [
            {
                "key": "count",
                "label": "Number of frames to add",
                "type": "number",
                "min": 1,
                "max": 10,
                "default": 1,
                "required": true
            },
            {
                "key": "frame_type",
                "label": "Frame type",
                "type": "select",
                "options": ["foundation", "drawn comb", "empty"],
                "required": false
            },
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "placeholder": "e.g., Added to brood box",
                "required": false
            }
        ],
        "updates": [],
        "creates": []
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 3. Remove frame template
-- No auto-effects - frame tracking is done via inspection records
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-remove-frame',
    NULL,
    'remove_frame',
    'Remove frame',
    'Remove one or more frames from the hive. Frame count is tracked via inspections.',
    '{
        "prompts": [
            {
                "key": "count",
                "label": "Number of frames to remove",
                "type": "number",
                "min": 1,
                "max": 10,
                "default": 1,
                "required": true
            },
            {
                "key": "reason",
                "label": "Reason for removal",
                "type": "select",
                "options": ["old comb", "damaged", "disease", "harvest", "other"],
                "required": false
            },
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "required": false
            }
        ],
        "updates": [],
        "creates": []
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 4. Harvest frames template
-- Creates a harvest record
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-harvest-frames',
    NULL,
    'harvest_frames',
    'Harvest frames',
    'Harvest honey frames. Creates a harvest record with weight and frame count.',
    '{
        "prompts": [
            {
                "key": "frames",
                "label": "Number of frames harvested",
                "type": "number",
                "min": 1,
                "max": 20,
                "required": true
            },
            {
                "key": "weight_kg",
                "label": "Estimated weight (kg)",
                "type": "number",
                "min": 0,
                "max": 100,
                "step": 0.1,
                "required": false
            },
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "placeholder": "e.g., Spring harvest, light amber",
                "required": false
            }
        ],
        "updates": [],
        "creates": [
            {
                "entity": "harvest",
                "fields": {
                    "frames_harvested": "{{completion_data.frames}}",
                    "weight_kg": "{{completion_data.weight_kg}}",
                    "harvested_at": "{{current_date}}",
                    "notes": "{{completion_data.notes}}"
                }
            }
        ]
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 5. Add feed template
-- Creates a feeding record
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-add-feed',
    NULL,
    'add_feed',
    'Add feed',
    'Feed the hive. Creates a feeding record with type, amount, and concentration.',
    '{
        "prompts": [
            {
                "key": "feed_type",
                "label": "Feed type",
                "type": "select",
                "options": ["sugar_syrup", "fondant", "pollen_patty", "other"],
                "required": true
            },
            {
                "key": "amount",
                "label": "Amount",
                "type": "text",
                "placeholder": "e.g., 2 liters, 1 kg",
                "required": true
            },
            {
                "key": "concentration",
                "label": "Concentration (for syrup)",
                "type": "select",
                "options": ["1:1", "2:1", "n/a"],
                "required": false
            },
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "required": false
            }
        ],
        "updates": [],
        "creates": [
            {
                "entity": "feeding",
                "fields": {
                    "feed_type": "{{completion_data.feed_type}}",
                    "amount": "{{completion_data.amount}}",
                    "concentration": "{{completion_data.concentration}}",
                    "fed_at": "{{current_date}}",
                    "notes": "{{completion_data.notes}}"
                }
            }
        ]
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 6. Treatment template
-- Creates a treatment record
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-treatment',
    NULL,
    'treatment',
    'Treatment',
    'Apply a treatment to the hive. Creates a treatment record.',
    '{
        "prompts": [
            {
                "key": "treatment_type",
                "label": "Treatment type",
                "type": "select",
                "options": ["oxalic_acid", "formic_acid", "thymol", "apivar", "apistan", "other"],
                "required": true
            },
            {
                "key": "method",
                "label": "Application method",
                "type": "select",
                "options": ["dribble", "vaporization", "strip", "pad", "other"],
                "required": true
            },
            {
                "key": "dosage",
                "label": "Dosage",
                "type": "text",
                "placeholder": "e.g., 5ml per seam",
                "required": false
            },
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "required": false
            }
        ],
        "updates": [],
        "creates": [
            {
                "entity": "treatment",
                "fields": {
                    "treatment_type": "{{completion_data.treatment_type}}",
                    "method": "{{completion_data.method}}",
                    "dosage": "{{completion_data.dosage}}",
                    "treated_at": "{{current_date}}",
                    "notes": "{{completion_data.notes}}"
                }
            }
        ]
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 7. Add brood box template
-- Updates hive.brood_boxes with increment
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-add-brood-box',
    NULL,
    'add_brood_box',
    'Add brood box',
    'Add a brood box to the hive. Updates the hive brood box count.',
    '{
        "prompts": [
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "placeholder": "e.g., Added second brood box for expansion",
                "required": false
            }
        ],
        "updates": [
            {
                "target": "hive.brood_boxes",
                "action": "increment",
                "value": 1
            }
        ],
        "creates": []
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 8. Add honey super template
-- Updates hive.honey_supers with increment
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-add-honey-super',
    NULL,
    'add_honey_super',
    'Add honey super',
    'Add a honey super to the hive. Updates the hive super count.',
    '{
        "prompts": [
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
                "placeholder": "e.g., Added for spring flow",
                "required": false
            }
        ],
        "updates": [
            {
                "target": "hive.honey_supers",
                "action": "increment",
                "value": 1
            }
        ],
        "creates": []
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 9. Remove box template
-- Prompts for box type, decrements the appropriate counter
INSERT INTO task_templates (id, tenant_id, type, name, description, auto_effects, is_system, created_by)
VALUES (
    'sys-template-remove-box',
    NULL,
    'remove_box',
    'Remove box',
    'Remove a box from the hive. Prompts for box type and updates the count.',
    '{
        "prompts": [
            {
                "key": "box_type",
                "label": "Box type to remove",
                "type": "select",
                "options": ["brood", "super"],
                "required": true
            },
            {
                "key": "reason",
                "label": "Reason",
                "type": "text",
                "placeholder": "e.g., Consolidating for winter",
                "required": false
            }
        ],
        "updates": [
            {
                "target": "hive.brood_boxes",
                "action": "decrement",
                "value": 1,
                "condition": "completion_data.box_type == ''brood''"
            },
            {
                "target": "hive.honey_supers",
                "action": "decrement",
                "value": 1,
                "condition": "completion_data.box_type == ''super''"
            }
        ],
        "creates": []
    }'::jsonb,
    TRUE,
    NULL
)
ON CONFLICT (id) DO NOTHING;
