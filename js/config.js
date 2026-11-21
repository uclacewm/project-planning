// Public settings for the CEWM Supabase project.
// The anon key is meant to be public: what it can read or change is decided by the
// database's row-level security rules (supabase/schema.sql), not by keeping it secret.
// Never put the service_role key in this file or anywhere in this repository.
export const SUPABASE_URL = 'https://ujinmvuodyvgatzdnvjz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaW5tdnVvZHl2Z2F0emRudmp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMzI2MjksImV4cCI6MjExMDcwODYyOX0.lPOiuRpkk4sHzq1wNuggWtaNHi73rKPoG45mrPfwVuk';

// Brand files kept in the private "planning-assets" storage bucket (members only),
// because the fonts are licensed for Center use and must not sit in a public repository.
export const BRAND_FILES = {
  logo: 'logo.png',
  fonts: [
    { family: 'Balboa', file: 'fonts/Balboa-Medium.ttf', weight: '500' },
    { family: 'Trade Gothic Next LT Pro', file: 'fonts/TradeGothicNextLTPro-Regular.ttf', weight: '400' },
    { family: 'Trade Gothic Next LT Pro Condensed', file: 'fonts/TradeGothicNextLTPro-BoldCondensed.ttf', weight: '700' },
    { family: 'P22 Mackinac Pro', file: 'fonts/P22MackinacPro-Medium.otf', weight: '500' }
  ]
};

// Short list used only in the sample-data preview. When signed in, the Lead and Owner lists come from the
// planning_people table (the Center roster), which is visible to signed-in members only.
export const PEOPLE = ['Yuchen Ling', 'Anna Fong', 'Annie Law', 'Ka-Kit Hui', 'Mary Fok', 'Weijun Zhang', 'Katie Hu', 'Sara Ptasnik', 'Irene Wang', 'Walter Tsang'];
