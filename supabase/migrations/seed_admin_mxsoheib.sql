-- Migration: Seed Alternative Admin User (mxsoheib)
-- Purpose: Create or update 'mxsoheib@gmail.com' to be an admin.

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'mxsoheib@gmail.com';
  v_password TEXT := 'password123';
  v_encrypted_pw TEXT;
BEGIN
  -- 1. Check if user exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- Generate new ID
    v_user_id := gen_random_uuid();
    -- Hash password (bcrypt)
    v_encrypted_pw := crypt(v_password, gen_salt('bf'));

    -- Insert into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000', -- Default instance_id
      v_email,
      v_encrypted_pw,
      now(), -- Auto-confirm email
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Admin Soheib"}',
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    -- Insert into auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_user_id,
      format('{"sub": "%s", "email": "%s"}', v_user_id, v_email)::jsonb,
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Created new admin user: % (ID: %)', v_email, v_user_id;
  ELSE
    RAISE NOTICE 'User % already exists (ID: %), promoting to admin...', v_email, v_user_id;
  END IF;

  -- 2. Ensure entry in public.host_profiles and set admin flags
  INSERT INTO public.host_profiles (id, display_name, is_admin, is_approved)
  VALUES (v_user_id, 'Admin Soheib', true, true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    is_approved = true;
    
  RAISE NOTICE 'User % permissions set: is_admin=TRUE, is_approved=TRUE', v_email;

END $$;
