/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full Google Calendar embed iframe src URL */
  readonly VITE_GOOGLE_CALENDAR_EMBED_URL?: string;
  /** Optional separate Google Form for UGLSU event proposals */
  readonly VITE_EVENT_PROPOSAL_URL?: string;
  /** HTTPS URL returning JSON array of internships (see public/internships.json shape) */
  readonly VITE_INTERNSHIPS_JSON_URL?: string;
  /** Supabase project URL (Settings → API) */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key — safe in the browser with RLS */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
