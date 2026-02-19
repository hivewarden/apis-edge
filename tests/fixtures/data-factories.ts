import { faker } from '@faker-js/faker';

/**
 * APIS Data Factories
 *
 * Factory functions for generating test data with sensible defaults.
 * All factories accept Partial overrides and use faker for unique values.
 */

// --- Sites ---

export type SiteData = {
  name: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
};

export const createSiteData = (overrides: Partial<SiteData> = {}): SiteData => ({
  name: faker.location.city() + ' Apiary',
  timezone: 'Europe/Brussels',
  latitude: parseFloat(faker.location.latitude().toString()),
  longitude: parseFloat(faker.location.longitude().toString()),
  ...overrides,
});

// --- Units (Devices) ---

export type UnitData = {
  name: string;
  site_id: string;
  model: string;
};

export const createUnitData = (overrides: Partial<UnitData> = {}): UnitData => ({
  name: `Unit-${faker.string.alphanumeric(6)}`,
  site_id: overrides.site_id || '',
  model: 'pi5',
  ...overrides,
});

// --- Hives ---

export type HiveData = {
  name: string;
  site_id: string;
  queen_source: string;
  queen_introduced_at: string;
  brood_boxes: number;
  honey_supers: number;
};

export const createHiveData = (overrides: Partial<HiveData> = {}): HiveData => ({
  name: `Hive ${faker.animal.insect()}`,
  site_id: overrides.site_id || '',
  queen_source: 'purchased',
  queen_introduced_at: faker.date.past().toISOString().split('T')[0],
  brood_boxes: faker.number.int({ min: 1, max: 3 }),
  honey_supers: faker.number.int({ min: 0, max: 4 }),
  ...overrides,
});

// --- Inspections ---

export type InspectionData = {
  hive_id: string;
  inspected_at: string;
  brood_pattern: string;
  temperament: string;
  queen_seen: boolean;
  notes: string;
};

export const createInspectionData = (overrides: Partial<InspectionData> = {}): InspectionData => ({
  hive_id: overrides.hive_id || '',
  inspected_at: new Date().toISOString(),
  brood_pattern: faker.helpers.arrayElement(['solid', 'spotty', 'empty']),
  temperament: faker.helpers.arrayElement(['calm', 'nervous', 'aggressive']),
  queen_seen: faker.datatype.boolean(),
  notes: faker.lorem.sentence(),
  ...overrides,
});

// --- Treatments ---

export type TreatmentData = {
  hive_id: string;
  treatment_type: string;
  method: string;
  started_at: string;
  notes: string;
};

export const createTreatmentData = (overrides: Partial<TreatmentData> = {}): TreatmentData => ({
  hive_id: overrides.hive_id || '',
  treatment_type: faker.helpers.arrayElement(['oxalic_acid', 'formic_acid', 'thymol', 'amitraz']),
  method: faker.helpers.arrayElement(['sublimation', 'trickle', 'strip', 'evaporation']),
  started_at: new Date().toISOString(),
  notes: faker.lorem.sentence(),
  ...overrides,
});

// --- Feedings ---

export type FeedingData = {
  hive_id: string;
  feed_type: string;
  unit: string;
  amount: number;
  fed_at: string;
};

export const createFeedingData = (overrides: Partial<FeedingData> = {}): FeedingData => ({
  hive_id: overrides.hive_id || '',
  feed_type: faker.helpers.arrayElement(['sugar_syrup', 'fondant', 'pollen_patty']),
  unit: faker.helpers.arrayElement(['liters', 'kg']),
  amount: faker.number.float({ min: 0.5, max: 10, fractionDigits: 1 }),
  fed_at: new Date().toISOString(),
  ...overrides,
});

// --- Tasks ---

export type TaskData = {
  title: string;
  hive_id: string;
  priority: string;
  due_date: string | null;
  notes: string;
};

export const createTaskData = (overrides: Partial<TaskData> = {}): TaskData => ({
  title: faker.lorem.sentence({ min: 3, max: 6 }),
  hive_id: overrides.hive_id || '',
  priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'urgent']),
  due_date: faker.date.soon({ days: 14 }).toISOString().split('T')[0],
  notes: faker.lorem.sentence(),
  ...overrides,
});

// --- Harvests ---

export type HarvestData = {
  site_id: string;
  harvested_at: string;
  notes: string;
  hives: Array<{ hive_id: string; weight_kg: number }>;
};

export const createHarvestData = (overrides: Partial<HarvestData> = {}): HarvestData => ({
  site_id: overrides.site_id || '',
  harvested_at: new Date().toISOString(),
  notes: faker.lorem.sentence(),
  hives: overrides.hives || [],
  ...overrides,
});

// --- Users ---

export type UserData = {
  email: string;
  name: string;
  password: string;
  role: string;
};

export const createUserData = (overrides: Partial<UserData> = {}): UserData => ({
  email: faker.internet.email().toLowerCase(),
  name: faker.person.fullName(),
  password: faker.internet.password({ length: 12 }),
  role: 'user',
  ...overrides,
});

// --- Equipment ---

export type EquipmentData = {
  hive_id: string;
  equipment_type: string;
  action: string;
  logged_at: string;
  notes: string;
};

export const createEquipmentData = (overrides: Partial<EquipmentData> = {}): EquipmentData => ({
  hive_id: overrides.hive_id || '',
  equipment_type: faker.helpers.arrayElement(['queen_excluder', 'entrance_reducer', 'feeder', 'super']),
  action: faker.helpers.arrayElement(['installed', 'removed', 'replaced']),
  logged_at: new Date().toISOString(),
  notes: faker.lorem.sentence(),
  ...overrides,
});
