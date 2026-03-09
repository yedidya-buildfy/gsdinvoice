-- Make document storage private and restrict access via storage RLS.

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

DROP POLICY IF EXISTS "Authenticated users can read document objects" ON storage.objects;
CREATE POLICY "Authenticated users can read document objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.files
      WHERE files.storage_path = storage.objects.name
        AND (
          files.user_id = auth.uid()
          OR (files.team_id IS NOT NULL AND public.is_active_team_member(files.team_id))
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload own document objects" ON storage.objects;
CREATE POLICY "Authenticated users can upload own document objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can delete accessible document objects" ON storage.objects;
CREATE POLICY "Authenticated users can delete accessible document objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.files
      WHERE files.storage_path = storage.objects.name
        AND (
          files.user_id = auth.uid()
          OR (files.team_id IS NOT NULL AND public.is_active_team_member(files.team_id))
        )
    )
  );
