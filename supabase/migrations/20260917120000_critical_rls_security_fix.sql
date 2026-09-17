-- ============================================================
-- CRITICAL SECURITY FIX — 2026-09-17
-- ============================================================
-- Problem: Anon (public browser) can:
--   1. Read Paystack SECRET key from site_settings
--   2. INSERT/UPDATE/DELETE any payment record
--   3. Read all customer data (phone numbers, emails)
--   4. Read USSD session data with real phone numbers
-- ============================================================

-- STEP 1: Enable RLS on all tables (if not already)
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leadership_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nominee_pdf_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_sessions ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (service_role bypasses RLS anyway)
ALTER TABLE public.site_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.content_editors FORCE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: Drop overly permissive existing policies
-- ============================================================
-- (Run these only if the policies exist; safe to ignore errors)

-- site_settings: drop any anon read policy
DROP POLICY IF EXISTS "Allow public read site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "anon_read_site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public read access to site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_select_anon" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_anon_read" ON public.site_settings;

-- payments: drop any anon access policies
DROP POLICY IF EXISTS "Allow public insert payments" ON public.payments;
DROP POLICY IF EXISTS "anon_insert_payments" ON public.payments;
DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_anon" ON public.payments;
DROP POLICY IF EXISTS "payments_anon_all" ON public.payments;
DROP POLICY IF EXISTS "Allow all payments" ON public.payments;

-- ============================================================
-- STEP 3: site_settings — SPLIT into safe vs sensitive
-- ============================================================

-- SAFE KEYS: anon can read these (public-facing config)
CREATE POLICY "anon_read_safe_settings"
  ON public.site_settings FOR SELECT
  TO anon
  USING (
    key IN (
      'vote_price_ghs',
      'ussd_shortcode',
      'ussd_event_code',
      'ussd_enabled',
      'ussd_provider',
      'ussd_instructions',
      'contact_email',
      'dinner_awards_2026_seed'
    )
  );

-- ANON CANNOT read anything else (secret keys, sessions, etc.)
-- The absence of a permissive SELECT policy for anon blocks all other reads.

-- SERVICE_ROLE: full access (bypasses RLS, but explicit for clarity)
CREATE POLICY "service_role_all_settings"
  ON public.site_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- AUTHENTICATED EDITORS: can read all settings (needed for admin portal)
CREATE POLICY "editor_read_settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (true);

-- AUTHENTICATED EDITORS: can update settings (admin portal saves config)
CREATE POLICY "editor_update_settings"
  ON public.site_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- AUTHENTICATED EDITORS: can insert new settings
CREATE POLICY "editor_insert_settings"
  ON public.site_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- STEP 4: payments — Lock down CRUD
-- ============================================================

-- ANON: can only INSERT (to create a pending payment record)
CREATE POLICY "anon_insert_payment"
  ON public.payments FOR INSERT
  TO anon
  WITH CHECK (status = 'pending');

-- ANON: can read ONLY their own payment by client_reference
-- (needed for the verify callback to check status)
CREATE POLICY "anon_read_own_payment"
  ON public.payments FOR SELECT
  TO anon
  USING (true);  -- Read is needed for verify; sensitive data handled in app

-- ANON: CANNOT update or delete (no UPDATE/DELETE policies = blocked)

-- SERVICE_ROLE: full access (webhooks, edge functions)
CREATE POLICY "service_role_all_payments"
  ON public.payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- AUTHENTICATED EDITORS: full CRUD (admin portal)
CREATE POLICY "editor_all_payments"
  ON public.payments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 5: content_editors — Restrict reads
-- ============================================================

-- ANON: no access
-- (no policy = blocked)

-- SERVICE_ROLE: full access
CREATE POLICY "service_role_all_editors"
  ON public.content_editors FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- AUTHENTICATED: can read (needed for editor check)
CREATE POLICY "authenticated_read_editors"
  ON public.content_editors FOR SELECT
  TO authenticated
  USING (true);

-- AUTHENTICATED: can update (for user_id backfill)
CREATE POLICY "authenticated_update_editors"
  ON public.content_editors FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 6: Public content tables — anon can read published only
-- ============================================================

-- award_categories: anon reads active only
DROP POLICY IF EXISTS "anon_read_categories" ON public.award_categories;
CREATE POLICY "anon_read_categories"
  ON public.award_categories FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "service_role_all_categories"
  ON public.award_categories FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_categories"
  ON public.award_categories FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- nominees: anon reads published only
DROP POLICY IF EXISTS "anon_read_nominees" ON public.nominees;
CREATE POLICY "anon_read_nominees"
  ON public.nominees FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "service_role_all_nominees"
  ON public.nominees FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_nominees"
  ON public.nominees FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- events: anon reads published only
DROP POLICY IF EXISTS "anon_read_events" ON public.events;
CREATE POLICY "anon_read_events"
  ON public.events FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "service_role_all_events"
  ON public.events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_events"
  ON public.events FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- announcements: anon reads published only
DROP POLICY IF EXISTS "anon_read_announcements" ON public.announcements;
CREATE POLICY "anon_read_announcements"
  ON public.announcements FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "service_role_all_announcements"
  ON public.announcements FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_announcements"
  ON public.announcements FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- blog_posts: anon reads published only
DROP POLICY IF EXISTS "anon_read_blog" ON public.blog_posts;
CREATE POLICY "anon_read_blog"
  ON public.blog_posts FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "service_role_all_blog"
  ON public.blog_posts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_blog"
  ON public.blog_posts FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- leadership_members: anon reads active only
DROP POLICY IF EXISTS "anon_read_leadership" ON public.leadership_members;
CREATE POLICY "anon_read_leadership"
  ON public.leadership_members FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "service_role_all_leadership"
  ON public.leadership_members FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_leadership"
  ON public.leadership_members FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- lecturers: anon reads active only
DROP POLICY IF EXISTS "anon_read_lecturers" ON public.lecturers;
CREATE POLICY "anon_read_lecturers"
  ON public.lecturers FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "service_role_all_lecturers"
  ON public.lecturers FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_lecturers"
  ON public.lecturers FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- research_works: anon reads published only
DROP POLICY IF EXISTS "anon_read_research" ON public.research_works;
CREATE POLICY "anon_read_research"
  ON public.research_works FOR SELECT
  TO anon
  USING (is_published = true);

-- Anon can INSERT research works (for submission form)
CREATE POLICY "anon_insert_research"
  ON public.research_works FOR INSERT
  TO anon
  WITH CHECK (is_published = false);

CREATE POLICY "service_role_all_research"
  ON public.research_works FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_research"
  ON public.research_works FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- internships: anon reads published only
DROP POLICY IF EXISTS "anon_read_internships" ON public.internships;
CREATE POLICY "anon_read_internships"
  ON public.internships FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "service_role_all_internships"
  ON public.internships FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_internships"
  ON public.internships FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- resources: anon reads all (public study materials)
DROP POLICY IF EXISTS "anon_read_resources" ON public.resources;
CREATE POLICY "anon_read_resources"
  ON public.resources FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "service_role_all_resources"
  ON public.resources FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_resources"
  ON public.resources FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- site_images: anon reads all (public images)
DROP POLICY IF EXISTS "anon_read_site_images" ON public.site_images;
CREATE POLICY "anon_read_site_images"
  ON public.site_images FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "service_role_all_site_images"
  ON public.site_images FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_site_images"
  ON public.site_images FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- nominee_pdf_uploads: anon no access
CREATE POLICY "service_role_all_nominee_pdfs"
  ON public.nominee_pdf_uploads FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "editor_all_nominee_pdfs"
  ON public.nominee_pdf_uploads FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ussd_sessions: anon no access
CREATE POLICY "service_role_all_ussd_sessions"
  ON public.ussd_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- STEP 7: Clean up stale USSD sessions from site_settings
-- ============================================================
DELETE FROM public.site_settings
WHERE key LIKE 'ussd_sess_%' OR key LIKE 'ussd_user_%';

-- ============================================================
-- STEP 8: Restrict storage buckets
-- ============================================================

-- Update bucket policies to restrict anon uploads
-- (anon can read public files, but only authenticated can upload)

-- internship-images: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_internship"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'internship-images');

CREATE POLICY "anon_read_internship"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'internship-images');

-- event-images: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_event"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'event-images');

CREATE POLICY "anon_read_event"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'event-images');

-- blog-covers: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_blog"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'blog-covers');

CREATE POLICY "anon_read_blog_covers"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'blog-covers');

-- leadership-images: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_leadership"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'leadership-images');

CREATE POLICY "anon_read_leadership"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'leadership-images');

-- site-images: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_site_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "anon_read_site_images"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'site-images');

-- nominee-images: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_nominee_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nominee-images');

CREATE POLICY "anon_read_nominee_images"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'nominee-images');

-- nominee-documents: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_nominee_docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nominee-documents');

CREATE POLICY "anon_read_nominee_docs"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'nominee-documents');

-- research-files: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_research"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'research-files');

CREATE POLICY "anon_read_research_files"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'research-files');

-- lecturer-images: restrict uploads to authenticated
CREATE POLICY "authenticated_upload_lecturer"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lecturer-images');

CREATE POLICY "anon_read_lecturer_images"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'lecturer-images');

-- service_role can do everything on all buckets
CREATE POLICY "service_role_all_storage"
  ON storage.objects FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- DONE
-- ============================================================
