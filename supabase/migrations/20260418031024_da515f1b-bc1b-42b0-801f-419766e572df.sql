CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name TEXT;
  _phone TEXT;
  _is_admin BOOLEAN;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _phone := NEW.raw_user_meta_data->>'phone';
  -- Auto-promote the fixed admin email
  _is_admin := COALESCE((NEW.raw_user_meta_data->>'is_admin')::boolean, false)
    OR LOWER(NEW.email) = 'hengles@adm.local';

  IF _is_admin AND (_full_name IS NULL OR _full_name = '') THEN
    _full_name := 'Hengles';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, _full_name, _phone);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::app_role ELSE 'client'::app_role END);

  RETURN NEW;
END;
$$;