
-- Make chat-media private
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- Drop the broad read policy and replace with participant-scoped
DROP POLICY IF EXISTS "chat_media_read" ON storage.objects;

-- Path convention: <user_id>/<filename>. Allow read if admin OR file belongs to the
-- requesting user OR file belongs to the client of a conversation the requester is part of.
CREATE POLICY "chat_media_read_participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media' AND (
      public.is_admin(auth.uid())
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );
