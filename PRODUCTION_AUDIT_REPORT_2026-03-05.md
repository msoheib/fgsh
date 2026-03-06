# Fgsh Production Gameplay and Security Audit

Audit date: March 5, 2026

## Scope
- Repo review of the web, mobile, shared, Supabase migration, and Edge Function code in this workspace.
- Black-box production validation against Supabase project `yabticelgerjwzrhyaye` using the configured public URL and anon key from this repo.
- Controlled tests used disposable accounts and disposable game rows only.

## Method and Limits
- Supabase Management API access to project `yabticelgerjwzrhyaye` was not available from this environment. Calls to `get_project`, `list_edge_functions`, and `get_publishable_keys` for that ref returned `Forbidden resource`.
- Supabase CLI access was available and confirmed the linked project as:
  - org: `bipvcpphubodzwmmkosi`
  - ref: `yabticelgerjwzrhyaye`
  - name: `Fgsh`
  - region: `South Asia (Mumbai)`
- Because of that, live validation used the public client surface only:
  - anon client
  - authenticated throwaway host accounts created through `auth.signUp`
  - direct PostgREST/RPC calls through `@supabase/supabase-js`
- Additional live metadata came from the linked Supabase CLI:
  - remote migration history
  - API keys
  - deployed function list
- Findings below are marked as:
  - `both`: confirmed in repo and confirmed live
  - `live-only drift`: observed live behavior diverges from current repo assumptions
  - `repo-only`: seen in code but not confirmed live

## Executive Summary
The live project is currently vulnerable to full game-state takeover through the public client surface. The highest-risk issues are not theoretical:

- A newly signed-up public user could self-promote to admin and paid host through `host_profiles`.
- Anonymous clients could create or mutate gameplay state for other players by passing raw UUIDs.
- Anonymous clients could mark payments as paid and upgrade host entitlements without a real payment.
- Stage category selection is writable by anyone.
- The deployment is drifted: tracked migrations stop at `20260211000002`, but later schema objects exist live outside tracked migration history.
- No Edge Functions are deployed on the linked project; both `generate-content` and `moyasar-webhook` return `404`.

One positive result: the March 2, 2026 `force_advance_round` timer guard appears live and prevented an immediate `answering -> voting -> completed` double-advance race.

## Findings

### Critical 1: Public users can self-escalate `host_profiles` to admin, approved admin, and paid host
- Status: `both`
- Repo evidence:
  - `host_profiles` self-update policy is broad: `supabase/migrations/20241119000001_create_host_profiles.sql:53`
  - later policy remains broad for self updates: `supabase/migrations/20250103_add_admin_dashboard.sql:87`
  - comments claim "display name only", but the database does not enforce column limits.
- Live evidence:
  - A disposable account created through public signup successfully updated its own `host_profiles` row from:
    - `is_admin=false`
    - `is_approved=false`
    - `is_paid_host=false`
    - `subscription_tier='free'`
  - to:
    - `is_admin=true`
    - `is_approved=true`
    - `is_paid_host=true`
    - `subscription_tier='premium'`
  - The test row was reverted after confirmation.
- Impact:
  - Any public user can grant themselves admin-panel access.
  - Any public user can bypass billing or entitlement gating.
  - Any public user can clear their own banned state.
- User impact:
  - Admin dashboard compromise
  - unauthorized content changes
  - fake paid subscriptions

### Critical 2: Anonymous clients can directly mutate gameplay tables and impersonate arbitrary players
- Status: `both`
- Repo evidence:
  - permissive MVP table policies still exist in the schema lineage:
    - `games/game_rounds/players/player_answers/votes`: `supabase/migrations/20241021000001_initial_schema.sql:136-180`
  - current app still uses raw `player_id` and direct table writes:
    - `packages/shared/src/services/GameService.ts:334`
    - `packages/shared/src/services/GameService.ts:490`
    - `packages/shared/src/services/GameService.ts:521`
    - `packages/shared/src/services/RoundService.ts:170`
    - `packages/shared/src/services/RoundService.ts:287`
    - `packages/shared/src/services/GameService.ts:467`
- Live evidence:
  - Anonymous client started a waiting game by calling `start_game_as_player` with the real host player's UUID.
  - Anonymous client inserted an answer for another player.
  - Anonymous client inserted a vote for another player.
  - Anonymous client called `cast_vote` for another player with no auth binding.
  - Anonymous client inserted and updated `game_rounds`.
  - Anonymous client updated another player's `score` and `connection_status`, then those changes were reverted.
  - Anonymous client called `advance_to_next_round_by_player` using the host player's UUID.
  - Anonymous client forced a captain reassignment through `promote_phase_captain` without a real disconnect.
- Affected RPC definitions:
  - `claim_phase_captain_if_unassigned`: `supabase/migrations/20260208000001_claim_phase_captain_if_unassigned.sql:6,74-75`
  - `start_game_as_player`: `supabase/migrations/20260211000002_enforce_manual_round_control.sql:161,219-220`
  - `advance_to_next_round_by_player`: `supabase/migrations/20260211000002_enforce_manual_round_control.sql:225,309-310`
  - `cast_vote`: `supabase/migrations/20260227000002_add_cast_vote_rpc_for_editable_voting.sql:8,90`
  - `promote_phase_captain`: `supabase/migrations/20260224000002_harden_promote_phase_captain.sql:9,81-82`
- Impact:
  - Any outsider with a game ID or player UUID can interfere with live rounds.
  - Score integrity, captain ownership, round order, and answer/vote integrity are not trustworthy.

### Critical 3: Payment upgrade path is publicly callable and can self-upgrade hosts without a real payment
- Status: `both`
- Repo evidence:
  - public frontend still calls `create_payment_record` and `update_payment_status` directly:
    - `packages/shared/src/services/PaymentService.ts:136`
    - `packages/shared/src/services/PaymentService.ts:242`
  - `update_payment_status` is a `SECURITY DEFINER` function with no explicit revoke in the repo:
    - `supabase/migrations/20241119000005_create_payments_table.sql:223`
  - webhook handler notes verification as optional:
    - `supabase/functions/moyasar-webhook/index.ts`
- Live evidence:
  - Authenticated disposable host created a payment record with a fake Moyasar payment ID.
  - Anonymous client then called `update_payment_status(..., 'paid')`.
  - The disposable host profile changed to:
    - `is_paid_host=true`
    - `subscription_tier='basic'`
    - populated `subscription_expires_at`
  - The host profile was reset after confirmation.
- Impact:
  - Billing and entitlement are fully bypassable.
  - Paid features can be granted without payment.

### High 4: Stage category prompt state is writable by anyone
- Status: `both`
- Repo evidence:
  - `supabase/migrations/20260227000003_add_game_category_prompts_for_tv_sync.sql:30`
  - `supabase/migrations/20260227000003_add_game_category_prompts_for_tv_sync.sql:43`
- Live evidence:
  - Anonymous client upserted `game_category_prompts` with arbitrary options and `selected_category='Hack'`.
- Impact:
  - Any spectator or automated client can alter the category shown to players and TV during stage transitions.
  - This directly affects question selection and game fairness.

### Medium 5: `is_banned` is not enforced on host gameplay paths
- Status: `both`
- Repo evidence:
  - ban field added: `supabase/migrations/20250103_add_admin_dashboard.sql:15`
  - ban usage only appears in admin UI/services, not in auth/gameplay code:
    - `packages/shared/src/services/AdminService.ts`
    - `packages/web/src/components/admin/UserManager.tsx`
  - no gameplay-path references were found in `packages/shared`, `packages/web/src/pages`, or `packages/mobile/src` outside admin management.
- Live evidence:
  - Disposable host was marked `is_banned=true`.
  - The same host successfully created a new game while banned.
  - The ban was reverted after confirmation.
- Impact:
  - Current bans are informational only for host accounts.
  - The product currently cannot enforce "banned users cannot play" under the shipped anonymous-player model.

### Medium 6: Live deployment drift on `leave_game_as_player`
- Status: `live-only drift`
- Repo evidence:
  - current client expects `leave_game_as_player`: `packages/shared/src/services/GameService.ts:490`
  - store uses it first and falls back to direct player disconnect only on error: `packages/shared/src/stores/gameStore.ts:1671-1675`
  - migration exists in repo: `supabase/migrations/20260224000001_add_captain_failover_on_player_leave.sql`
- Live evidence:
  - RPC call returned `PGRST202 Could not find the function public.leave_game_as_player(...) in the schema cache`.
- Impact:
  - Live leave behavior is currently fallback-driven, not atomic.
  - Captain failover on graceful leave may be less reliable than the repo intends.

### Medium 7: Remote migration history is drifted and incomplete
- Status: `live-only drift`
- Live evidence:
  - `supabase migration list` shows remote tracked migrations only through `20260211000002`.
  - local tracked migrations from `20260217000001` through `20260304000001` are not recorded remotely.
  - despite that, live objects from later work do exist, including:
    - `game_category_prompts`
    - `game_audio_cues`
    - `cast_vote`
  - this means the live schema is not reproducible from migration history alone.
- Impact:
  - deploy safety is reduced because schema state is no longer fully represented by versioned migrations
  - incident response and rollback become less reliable
  - repo-to-production diffing is partially untrustworthy until the schema is re-baselined

### Medium 8: Required Edge Functions are not deployed on the linked project
- Status: `live-only drift`
- Repo evidence:
  - expected functions exist locally:
    - `supabase/functions/generate-content/index.ts`
    - `supabase/functions/moyasar-webhook/index.ts`
- Live evidence:
  - `supabase functions list --project-ref yabticelgerjwzrhyaye` returned an empty list
  - `OPTIONS https://yabticelgerjwzrhyaye.supabase.co/functions/v1/generate-content` returned `404`
  - `OPTIONS https://yabticelgerjwzrhyaye.supabase.co/functions/v1/moyasar-webhook` returned `404`
- Impact:
  - admin LLM question/lie generation is not actually deployable on the current project
  - the intended webhook payment ingestion path is absent
  - any payment completion currently depends on insecure client-side mutation instead of a deployed server endpoint

### Low 9: The linked project still uses only legacy JWT API keys
- Status: `live-only drift`
- Live evidence:
  - CLI API key listing returned only:
    - legacy `anon`
    - legacy `service_role`
  - no publishable key set was present.
- Impact:
  - not the root cause of the critical issues above
  - but key management and rotation posture is behind the current Supabase model

## Validated Safeguards
- `force_advance_round` duplicate-call guard appears deployed and working.
- Test:
  - first anonymous `force_advance_round` moved a round from `answering` to `voting`
  - immediate second call left the round in `voting`
- Matching repo reference:
  - `supabase/migrations/20260302000001_guard_force_advance_voting_timer.sql:1-112`

## Overall Risk
- Current production risk is `Critical`.
- Game fairness, entitlement, and admin boundaries are all bypassable from the public client surface.
- The highest-priority fixes are:
  1. remove direct public writes to gameplay tables
  2. bind player actions to server-verified player session tokens
  3. lock down payment status mutation to server-only paths
  4. remove broad `host_profiles` self-update capability
  5. re-baseline the live schema so migration history matches deployed reality
  6. deploy the missing Edge Functions or remove the dead feature paths
