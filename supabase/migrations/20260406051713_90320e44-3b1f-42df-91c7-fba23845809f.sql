
-- 1. Fix user_roles DELETE policy to scope by organization
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can delete same-org roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    (role <> 'super_admin'::app_role)
    AND (
      is_super_admin(auth.uid())
      OR (
        has_role(auth.uid(), 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM profiles admin_p
          JOIN profiles target_p ON target_p.user_id = user_roles.user_id
          WHERE admin_p.user_id = auth.uid()
            AND admin_p.organization_id IS NOT NULL
            AND admin_p.organization_id = target_p.organization_id
        )
      )
    )
  );

-- 2. Fix photos bucket SELECT policy - scope to own org via assignments
DROP POLICY IF EXISTS "Authenticated users can view photos" ON storage.objects;
CREATE POLICY "Org-scoped photo read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'photos'
  AND (
    is_super_admin(auth.uid())
    OR (
      -- constructions path: constructions/{sr_id}/{construction_id}/...
      (storage.foldername(name))[1] = 'constructions'
      AND EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.sr_id = (storage.foldername(name))[2]
          AND a.organization_id = get_user_org_id(auth.uid())
      )
    )
    OR (
      -- pre-work path: pre-work/{assignment_id}/...
      (storage.foldername(name))[1] = 'pre-work'
      AND EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id::text = (storage.foldername(name))[2]
          AND a.organization_id = get_user_org_id(auth.uid())
      )
    )
    OR (
      -- sr-crews path: sr-crews/{org_id}/...
      (storage.foldername(name))[1] = 'sr-crews'
      AND (storage.foldername(name))[2] = get_user_org_id(auth.uid())::text
    )
  )
);

-- 3. Fix photos bucket DELETE policy - same scoping
DROP POLICY IF EXISTS "Authenticated users can delete own photos" ON storage.objects;
CREATE POLICY "Org-scoped photo delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'photos'
  AND (
    is_super_admin(auth.uid())
    OR (
      (storage.foldername(name))[1] = 'constructions'
      AND EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.sr_id = (storage.foldername(name))[2]
          AND a.organization_id = get_user_org_id(auth.uid())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'pre-work'
      AND EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id::text = (storage.foldername(name))[2]
          AND a.organization_id = get_user_org_id(auth.uid())
      )
    )
    OR (
      (storage.foldername(name))[1] = 'sr-crews'
      AND (storage.foldername(name))[2] = get_user_org_id(auth.uid())::text
    )
  )
);

-- 4. Fix surveys bucket SELECT policy - scope to own org via user_id path prefix
DROP POLICY IF EXISTS "Anyone can view survey files" ON storage.objects;
CREATE POLICY "Org-scoped survey file read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'surveys'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id::text = (storage.foldername(name))[1]
        AND p.organization_id = get_user_org_id(auth.uid())
    )
  )
);

-- 5. Fix gis-files bucket SELECT policy - scope to own org
DROP POLICY IF EXISTS "Authenticated users can read gis files" ON storage.objects;
CREATE POLICY "Org-scoped gis file read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'gis-files'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM gis_data g
      WHERE g.file_path = name
        AND g.organization_id = get_user_org_id(auth.uid())
    )
  )
);
