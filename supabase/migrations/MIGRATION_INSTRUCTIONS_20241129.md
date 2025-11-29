# Migration Instructions - Fix Voting System
**Date:** 2024-11-29
**Issue:** Voting system broken on host side

## Problem
The voting system had issues with duplicate correct answers being inserted, causing the voting pool to be corrupted or empty.

## Migrations to Apply

### 1. **20241129000001_fix_voting_duplicate_correct_answer.sql**
**Purpose:** Prevents duplicate correct answers from being inserted

**What it does:**
- Updates `advance_round_if_ready()` to check if correct answer already exists before inserting
- Updates `force_advance_round()` to check for existing correct answer
- Ensures only ONE correct answer is added to the voting pool per round

**Apply via Supabase SQL Editor:**
```sql
-- Copy and paste the contents of this file into Supabase SQL Editor and run
```

---

### 2. **20241129000002_cleanup_duplicate_correct_answers.sql**
**Purpose:** Cleans up any existing duplicate correct answers in the database

**What it does:**
- Finds rounds with multiple correct answers
- Keeps the oldest one (first inserted)
- Deletes all duplicates
- Logs how many were cleaned up

**Apply via Supabase SQL Editor:**
```sql
-- Copy and paste the contents of this file into Supabase SQL Editor and run
```

**Expected output:**
```
NOTICE: Cleaned up X duplicate correct answers
```

---

### 3. **20241129000003_voting_diagnostics.sql** (Optional - for debugging)
**Purpose:** Adds diagnostic functions to help debug voting issues

**Functions added:**
1. `check_voting_status(round_id)` - Shows voting status for a round
2. `list_round_answers(round_id)` - Lists all answers with vote counts

**Usage examples:**
```sql
-- Check voting status for a round
SELECT * FROM check_voting_status('your-round-id-here');

-- List all answers for a round
SELECT * FROM list_round_answers('your-round-id-here');
```

**Apply via Supabase SQL Editor:**
```sql
-- Copy and paste the contents of this file into Supabase SQL Editor and run
```

---

## How to Apply Migrations

1. **Open Supabase Dashboard** → Go to your project
2. **Navigate to SQL Editor** (left sidebar)
3. **Create a new query** (click "New query" button)
4. **Copy the contents** of each migration file in order:
   - First: `20241129000001_fix_voting_duplicate_correct_answer.sql`
   - Second: `20241129000002_cleanup_duplicate_correct_answers.sql`
   - Third (optional): `20241129000003_voting_diagnostics.sql`
5. **Paste into SQL Editor** and click "Run"
6. **Check for errors** - should see success messages

## Verification

After applying migrations, test the voting system:

1. **Start a new game** with 2+ players
2. **All players submit answers** - should transition to voting
3. **Check voting phase:**
   - Should see all player answers + correct answer
   - Host should be able to vote
   - No duplicate answers should appear

### Using Diagnostic Functions

If voting still has issues:

```sql
-- Get the current round ID from your game
SELECT id, round_number, status
FROM game_rounds
WHERE game_id = 'your-game-id'
ORDER BY round_number DESC
LIMIT 1;

-- Check voting status
SELECT * FROM check_voting_status('round-id-from-above');

-- Expected output:
-- round_status | total_answers | correct_answers | player_answers | total_votes | connected_players | required_players
-- voting       | 3             | 1               | 2              | 0           | 2                 | 2

-- List all answers
SELECT * FROM list_round_answers('round-id-from-above');

-- Expected output:
-- answer_id | answer_text | is_correct | player_id | player_name | submitted_at | vote_count
-- ...       | Player 1 ans| false      | ...       | Player1     | ...          | 0
-- ...       | Player 2 ans| false      | ...       | Player2     | ...          | 0
-- ...       | Correct ans | true       | NULL      | System      | ...          | 0
```

## Rollback (if needed)

If you need to rollback these changes:

```sql
-- Restore original functions from add_server_side_phase_transitions.sql
-- (Use the original migration file to restore)
```

## Post-Migration

After applying these migrations:
1. **Restart your app** (if running locally)
2. **Clear browser cache** and reload
3. **Test with a new game** - old games may still have issues
4. **Check Supabase logs** for NOTICE messages during phase transitions

## Support

If voting is still broken after applying these migrations:
1. Run the diagnostic functions (see Verification section)
2. Check browser console for errors
3. Check Supabase logs for database errors
4. Share the output of `check_voting_status()` and `list_round_answers()` for further debugging
