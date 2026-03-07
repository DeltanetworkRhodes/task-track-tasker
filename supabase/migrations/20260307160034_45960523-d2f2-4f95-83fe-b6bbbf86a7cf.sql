DROP POLICY IF EXISTS "Anyone can view photos" ON storage.objects;
CREATE POLICY "Authenticated users can view photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photos');