
-- Drop overly broad read policies on the public buckets
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Service images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "products_public_read" ON storage.objects;

-- Public objects can still be fetched via the public URL endpoint (which bypasses RLS
-- for buckets marked public=true). RLS only governs the SQL/REST list/select path.
-- We leave no SELECT policy on storage.objects for these buckets so authenticated
-- listing is blocked while public CDN reads keep working.

-- Re-add admin-managed write policies (already present from previous migrations for
-- avatars and services) — only re-create if missing to keep idempotency.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='avatars_owner_or_admin_write'
  ) THEN
    CREATE POLICY "avatars_owner_or_admin_write" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid())));
    CREATE POLICY "avatars_owner_or_admin_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid())));
  END IF;
END $$;
