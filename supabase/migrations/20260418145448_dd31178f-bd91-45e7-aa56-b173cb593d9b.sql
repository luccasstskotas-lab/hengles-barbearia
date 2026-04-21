
-- ============ ENUMS ============
CREATE TYPE public.notification_type AS ENUM ('booking', 'message', 'review', 'system');
CREATE TYPE public.message_type AS ENUM ('text', 'image', 'audio', 'video');
CREATE TYPE public.message_status AS ENUM ('sent', 'delivered', 'read');

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- Inserts only via SECURITY DEFINER triggers; no INSERT policy.

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  client_unread_count INT NOT NULL DEFAULT 0,
  admin_unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_last_msg ON public.conversations(last_message_at DESC);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = client_id OR public.is_admin(auth.uid()));
CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);
CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = client_id OR public.is_admin(auth.uid()));

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  type public.message_type NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_duration_seconds INT,
  status public.message_status NOT NULL DEFAULT 'sent',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id AND c.client_id = auth.uid())
  );
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND (
      public.is_admin(auth.uid()) OR
      EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = messages.conversation_id AND c.client_id = auth.uid())
    )
  );
CREATE POLICY messages_update ON public.messages
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id AND c.client_id = auth.uid())
  );

-- ============ TYPING INDICATORS ============
CREATE TABLE public.typing_indicators (
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY typing_select ON public.typing_indicators
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.conversations c
            WHERE c.id = typing_indicators.conversation_id AND c.client_id = auth.uid())
  );
CREATE POLICY typing_upsert ON public.typing_indicators
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY typing_update ON public.typing_indicators
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY typing_delete ON public.typing_indicators
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============ PRODUCTS (Shop) ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_select_all ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
  ON CONFLICT (id) DO NOTHING;

-- products bucket policies
CREATE POLICY "products_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "products_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'products' AND public.is_admin(auth.uid()));
CREATE POLICY "products_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin(auth.uid()));
CREATE POLICY "products_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin(auth.uid()));

-- chat-media policies (any authenticated user uploads/reads; controlled by app logic + storage path)
CREATE POLICY "chat_media_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-media');
CREATE POLICY "chat_media_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============ HELPER: get admin user id (first admin) ============
CREATE OR REPLACE FUNCTION public.get_admin_user_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1
$$;

-- ============ TRIGGER: notify admin on new booking ============
CREATE OR REPLACE FUNCTION public.notify_on_new_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _admin UUID;
  _client_name TEXT;
  _service_name TEXT;
BEGIN
  _admin := public.get_admin_user_id();
  IF _admin IS NULL THEN RETURN NEW; END IF;
  SELECT full_name INTO _client_name FROM public.profiles WHERE id = NEW.client_id;
  SELECT name INTO _service_name FROM public.services WHERE id = NEW.service_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (
    _admin, 'booking',
    'Novo agendamento',
    COALESCE(_client_name, 'Cliente') || ' agendou ' || COALESCE(_service_name, 'um serviço') ||
      ' em ' || to_char(NEW.slot_date, 'DD/MM') || ' às ' || to_char(NEW.start_time, 'HH24:MI'),
    '/app/agenda',
    jsonb_build_object('booking_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER bookings_notify_admin AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_booking();

-- ============ TRIGGER: notify on new message ============
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _conv_client UUID;
  _admin UUID;
  _recipient UUID;
  _sender_name TEXT;
  _preview TEXT;
BEGIN
  SELECT client_id INTO _conv_client FROM public.conversations WHERE id = NEW.conversation_id;
  _admin := public.get_admin_user_id();
  IF NEW.sender_id = _conv_client THEN
    _recipient := _admin;
  ELSE
    _recipient := _conv_client;
  END IF;

  _preview := CASE NEW.type
    WHEN 'text' THEN COALESCE(NEW.content, '')
    WHEN 'image' THEN '📷 Foto'
    WHEN 'audio' THEN '🎙️ Áudio'
    WHEN 'video' THEN '🎬 Vídeo'
  END;

  -- update conversation preview/counters
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(_preview, 80),
      client_unread_count = CASE WHEN NEW.sender_id <> _conv_client THEN client_unread_count + 1 ELSE client_unread_count END,
      admin_unread_count = CASE WHEN NEW.sender_id = _conv_client THEN admin_unread_count + 1 ELSE admin_unread_count END
  WHERE id = NEW.conversation_id;

  IF _recipient IS NOT NULL AND _recipient <> NEW.sender_id THEN
    SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (
      _recipient, 'message',
      COALESCE(_sender_name, 'Nova mensagem'),
      LEFT(_preview, 100),
      '/app/chat',
      jsonb_build_object('conversation_id', NEW.conversation_id)
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_notify AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

-- ============ TRIGGER: notify admin on new review ============
CREATE OR REPLACE FUNCTION public.notify_on_new_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _admin UUID;
  _client_name TEXT;
BEGIN
  _admin := public.get_admin_user_id();
  IF _admin IS NULL THEN RETURN NEW; END IF;
  SELECT full_name INTO _client_name FROM public.profiles WHERE id = NEW.client_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (
    _admin, 'review',
    'Nova avaliação',
    COALESCE(_client_name, 'Cliente') || ' deixou ' || NEW.rating || '★',
    '/app/avaliacoes',
    jsonb_build_object('review_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER reviews_notify_admin AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_review();

-- ============ RPC: mark conversation as read ============
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _is_admin BOOLEAN; _client UUID;
BEGIN
  _is_admin := public.is_admin(auth.uid());
  SELECT client_id INTO _client FROM public.conversations WHERE id = _conversation_id;
  IF NOT _is_admin AND _client <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.messages
    SET status = 'read', read_at = COALESCE(read_at, now())
    WHERE conversation_id = _conversation_id
      AND sender_id <> auth.uid()
      AND status <> 'read';
  IF _is_admin THEN
    UPDATE public.conversations SET admin_unread_count = 0 WHERE id = _conversation_id;
  ELSE
    UPDATE public.conversations SET client_unread_count = 0 WHERE id = _conversation_id;
  END IF;
END;
$$;

-- ============ RPC: get or create conversation for current client ============
CREATE OR REPLACE FUNCTION public.get_or_create_my_conversation()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id UUID;
BEGIN
  SELECT id INTO _id FROM public.conversations WHERE client_id = auth.uid();
  IF _id IS NULL THEN
    INSERT INTO public.conversations (client_id) VALUES (auth.uid()) RETURNING id INTO _id;
  END IF;
  RETURN _id;
END;
$$;

-- ============ RPC: presence heartbeat ============
CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.profiles SET is_online = true, last_seen_at = now() WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.set_offline()
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.profiles SET is_online = false, last_seen_at = now() WHERE id = auth.uid();
$$;

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
