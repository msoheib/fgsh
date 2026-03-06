-- Migration: Add admin-managed TV announcer audio cues
-- Purpose:
-- 1) Admin uploads audio clips for predefined cue points.
-- 2) TV screen reads and plays these clips on transitions.
-- 3) Player screens are unaffected.

CREATE TABLE IF NOT EXISTS public.game_audio_cues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cue_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  audio_url TEXT NULL,
  duration_ms INTEGER NULL CHECK (duration_ms IS NULL OR duration_ms > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID NULL REFERENCES public.host_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_audio_cues_key ON public.game_audio_cues(cue_key);
CREATE INDEX IF NOT EXISTS idx_game_audio_cues_active ON public.game_audio_cues(is_active);

ALTER TABLE public.game_audio_cues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Game audio cues are viewable by everyone" ON public.game_audio_cues;
CREATE POLICY "Game audio cues are viewable by everyone"
ON public.game_audio_cues
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Approved admins can insert game audio cues" ON public.game_audio_cues;
CREATE POLICY "Approved admins can insert game audio cues"
ON public.game_audio_cues
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
);

DROP POLICY IF EXISTS "Approved admins can update game audio cues" ON public.game_audio_cues;
CREATE POLICY "Approved admins can update game audio cues"
ON public.game_audio_cues
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
);

DROP POLICY IF EXISTS "Approved admins can delete game audio cues" ON public.game_audio_cues;
CREATE POLICY "Approved admins can delete game audio cues"
ON public.game_audio_cues
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
);

DROP TRIGGER IF EXISTS game_audio_cues_updated_at ON public.game_audio_cues;
CREATE TRIGGER game_audio_cues_updated_at
BEFORE UPDATE ON public.game_audio_cues
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT ON public.game_audio_cues TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.game_audio_cues TO authenticated;

COMMENT ON TABLE public.game_audio_cues IS
'Admin-managed audio cues played on TV transitions only.';

-- Seed predefined cue points (idempotent).
INSERT INTO public.game_audio_cues (cue_key, label)
VALUES
  ('category_selection_start', 'بداية اختيار الفئة'),
  ('answering_start', 'بدء كتابة الإجابات'),
  ('voting_start', 'بدء التصويت'),
  ('reveal_start', 'بدء كشف الإجابات'),
  ('double_points_round_start', 'بداية جولة النقاط المضاعفة'),
  ('triple_points_round_start', 'بداية الجولة النهائية (3x)')
ON CONFLICT (cue_key) DO NOTHING;

-- Storage bucket for cue files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-audio-cues', 'game-audio-cues', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public can read game audio cue files" ON storage.objects;
CREATE POLICY "Public can read game audio cue files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'game-audio-cues');

DROP POLICY IF EXISTS "Approved admins can upload game audio cue files" ON storage.objects;
CREATE POLICY "Approved admins can upload game audio cue files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'game-audio-cues'
  AND EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
);

DROP POLICY IF EXISTS "Approved admins can update game audio cue files" ON storage.objects;
CREATE POLICY "Approved admins can update game audio cue files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'game-audio-cues'
  AND EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
)
WITH CHECK (
  bucket_id = 'game-audio-cues'
  AND EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
);

DROP POLICY IF EXISTS "Approved admins can delete game audio cue files" ON storage.objects;
CREATE POLICY "Approved admins can delete game audio cue files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'game-audio-cues'
  AND EXISTS (
    SELECT 1
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid()
      AND hp.is_admin = TRUE
      AND hp.is_approved = TRUE
  )
);
