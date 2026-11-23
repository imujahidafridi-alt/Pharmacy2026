// One shared vocabulary for categories and units.
// Includes older names so existing items can still be filtered and edited safely.

export const CATEGORIES = [
  'Tablets & Capsules',
  'Syrups & Suspensions',
  'Injections & Infusions',
  'Creams & Ointments',
  'Baby Care',
  'Personal Care',
  'Beverages & Nutrition',
  'General Retail / First Aid',
  'Analgesics & Antipyretics',
  'Antibiotics',
  'Anti-diabetic',
  'Cardiovascular',
  'Gastrointestinal / PPI',
  'Respiratory',
  'Antihistamines',
  'Ophthalmic',
  'Vitamins & Minerals',
  'Dermatology',
];

export const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Ointment',
  'Cream',
  'Gel',
  'Eye Drops',
  'Inhaler',
  'Sachet',
  'Powder',
];

export const UNIT_TYPES = [
  'Unit',
  'Pack',
  'Strip',
  'Bottle',
  'Tube',
  'Ampoule',
  'Inhaler',
  'Sachet',
];

// Used as a fallback if an item carries a category we have never seen before
export function normalizeCategory(value?: string): string {
  if (!value) return 'Tablets & Capsules';
  const trimmed = value.trim();
  return CATEGORIES.includes(trimmed) ? trimmed : 'Tablets & Capsules';
}
