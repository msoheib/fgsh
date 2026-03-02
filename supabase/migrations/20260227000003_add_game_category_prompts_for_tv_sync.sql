-- Migration: Share captain category selection options with TV and players
-- Purpose:
-- 1) Persist the 4 random category options shown to captain
-- 2) Allow TV screen to display the exact same options in real time

CREATE TABLE IF NOT EXISTS public.game_category_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_category TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_game_category_prompts_game_round
  ON public.game_category_prompts(game_id, round_number);

ALTER TABLE public.game_category_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Game category prompts are viewable by everyone" ON public.game_category_prompts;
CREATE POLICY "Game category prompts are viewable by everyone"
ON public.game_category_prompts
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Game category prompts are writable by everyone" ON public.game_category_prompts;
CREATE POLICY "Game category prompts are writable by everyone"
ON public.game_category_prompts
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS game_category_prompts_updated_at ON public.game_category_prompts;
CREATE TRIGGER game_category_prompts_updated_at
BEFORE UPDATE ON public.game_category_prompts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_category_prompts TO anon, authenticated;

COMMENT ON TABLE public.game_category_prompts IS
'Stores round category choice options so captain and TV show identical category prompts.';
