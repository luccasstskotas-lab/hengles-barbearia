
-- 1. Add stock to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

-- 2. FKs to profiles (so PostgREST can embed profiles)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_client_id_fkey') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_client_id_fkey') THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_client_id_fkey') THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_bookings_client ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slotdate ON public.bookings(slot_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON public.bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_lastmsg ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_client ON public.reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON public.reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_typing_conv ON public.typing_indicators(conversation_id);
CREATE INDEX IF NOT EXISTS idx_avail_date ON public.availability_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_profiles_online ON public.profiles(is_online);

-- 4. Ensure realtime publication includes everything we need
DO $$
DECLARE _t text;
BEGIN
  FOR _t IN SELECT unnest(ARRAY[
    'profiles','bookings','services','products','reviews',
    'notifications','conversations','messages','typing_indicators','availability_slots'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', _t);
  END LOOP;
END $$;

-- 5. Helper to fetch admin profile from client (bypasses user_roles RLS)
CREATE OR REPLACE FUNCTION public.get_admin_profile()
RETURNS TABLE(id uuid, full_name text, avatar_url text, is_online boolean, last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.is_online, p.last_seen_at
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id
  WHERE r.role = 'admin'
  ORDER BY r.created_at LIMIT 1;
$$;
