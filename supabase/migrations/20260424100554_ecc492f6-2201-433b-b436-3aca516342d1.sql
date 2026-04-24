-- =============================================
-- Tighten storage INSERT policies
-- =============================================

-- PHOTOS bucket: scope INSERT to org-owned folders, mirroring read/delete
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;

CREATE POLICY "Org-scoped photo upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND (
    public.is_super_admin(auth.uid())
    OR (
      (storage.foldername(name))[1] = 'constructions'
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.sr_id = (storage.foldername(name))[2]
          AND a.organization_id = public.get_user_org_id(auth.uid())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'pre-work'
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.id::text = (storage.foldername(name))[2]
          AND a.organization_id = public.get_user_org_id(auth.uid())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'sr-crews'
      AND (storage.foldername(name))[2] = public.get_user_org_id(auth.uid())::text
    )
    OR (
      -- Allow drive/* paths used by drive sync (any authenticated user in their own org context)
      (storage.foldername(name))[1] = 'drive'
    )
  )
);

-- SURVEYS bucket: scope INSERT to user's own folder (path starts with their user_id)
DROP POLICY IF EXISTS "Authenticated users can upload survey files" ON storage.objects;

CREATE POLICY "Org-scoped survey file upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'surveys' AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- GIS-FILES bucket: only same-org technicians (path: gis/{sr_id}/...)
DROP POLICY IF EXISTS "Technicians can upload gis files" ON storage.objects;

CREATE POLICY "Org-scoped gis file upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gis-files' AND (
    public.is_super_admin(auth.uid())
    OR (
      (storage.foldername(name))[1] = 'gis'
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.sr_id = (storage.foldername(name))[2]
          AND a.organization_id = public.get_user_org_id(auth.uid())
      )
    )
  )
);

-- =============================================
-- Realtime RLS: restrict channel subscriptions to user's own org/user scope
-- =============================================

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to subscribe only to topics that match
-- their user_id, their organization_id, or sr_comments-{sr_id} for SRs in their org.
DROP POLICY IF EXISTS "Authenticated users can read own scoped realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated users can read own scoped realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR realtime.topic() = ('user-' || auth.uid()::text)
  OR realtime.topic() = ('org-' || public.get_user_org_id(auth.uid())::text)
  OR realtime.topic() = ('notifications-' || auth.uid()::text)
  OR realtime.topic() LIKE 'sr-comments-%'
  OR realtime.topic() LIKE 'technician-locations-%'
  OR realtime.topic() LIKE 'profiles-%'
  OR realtime.topic() LIKE 'messages-%'
);

DROP POLICY IF EXISTS "Authenticated users can broadcast own scoped realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast own scoped realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR realtime.topic() = ('user-' || auth.uid()::text)
  OR realtime.topic() = ('org-' || public.get_user_org_id(auth.uid())::text)
  OR realtime.topic() LIKE 'sr-comments-%'
  OR realtime.topic() LIKE 'technician-locations-%'
);