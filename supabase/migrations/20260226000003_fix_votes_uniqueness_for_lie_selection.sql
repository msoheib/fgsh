-- Migration: Fix vote uniqueness drift so multiple players can vote the same answer
-- Context:
-- Some environments may have accidentally introduced unique constraints/indexes on answer_id
-- (or round_id + answer_id), which blocks players from selecting the same lie option.
-- Intended behavior: unique by (round_id, voter_id) only.

-- 1) Drop any accidental UNIQUE constraints on votes that involve answer_id.
DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.votes'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%answer_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS %I', v_constraint.conname);
  END LOOP;
END
$$;

-- 2) Drop any accidental standalone UNIQUE indexes on votes that include answer_id.
DO $$
DECLARE
  v_index RECORD;
BEGIN
  FOR v_index IN
    SELECT ns.nspname AS schema_name, idx.relname AS index_name
    FROM pg_index i
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    WHERE tbl.oid = 'public.votes'::regclass
      AND i.indisunique
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conindid = i.indexrelid
      )
      AND EXISTS (
        SELECT 1
        FROM unnest(i.indkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = k.attnum
        WHERE a.attname = 'answer_id'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', v_index.schema_name, v_index.index_name);
  END LOOP;
END
$$;

-- 3) Ensure intended uniqueness: one vote per player per round.
-- Clean potential duplicates first (keep the newest row).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY round_id, voter_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.votes
)
DELETE FROM public.votes v
USING ranked r
WHERE v.id = r.id
  AND r.rn > 1;

ALTER TABLE public.votes
DROP CONSTRAINT IF EXISTS one_vote_per_player_per_round;

ALTER TABLE public.votes
DROP CONSTRAINT IF EXISTS votes_round_id_voter_id_key;

ALTER TABLE public.votes
ADD CONSTRAINT one_vote_per_player_per_round
UNIQUE (round_id, voter_id);

-- 4) Keep non-unique performance indexes for vote lookups.
CREATE INDEX IF NOT EXISTS idx_votes_answer_id ON public.votes(answer_id);
CREATE INDEX IF NOT EXISTS idx_votes_round_answer ON public.votes(round_id, answer_id);

COMMENT ON CONSTRAINT one_vote_per_player_per_round ON public.votes IS
'Each player can vote once per round; many players may vote the same answer.';
