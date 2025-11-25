# Supabase Auth Migration Guide

## Overview

This migration adds Supabase Authentication for game hosts while keeping players anonymous. After applying these migrations:

- ✅ **Hosts must log in** to create games
- ✅ **Players remain anonymous** - join via game code without accounts
- ✅ **Payment gating** (optional) - control who can create games
- ✅ **Host dashboard** - track games created, player count, stats
- ✅ **TV display mode** supported - authenticated host, no player record

## Migration Files

Apply these migrations **in order**:

1. **`20241119000001_create_host_profiles.sql`**
   - Creates `host_profiles` table
   - Links to `auth.users` via foreign key
   - Stores payment/subscription status
   - Auto-creates profile on user signup (trigger)

2. **`20241119000002_add_auth_host_to_games.sql`**
   - Adds `auth_host_id` column to `games` table
   - Links games to authenticated accounts
   - Maintains existing `host_id` for player tracking
   - Dual host system explained in comments

3. **`20241119000003_update_rls_policies_for_auth.sql`**
   - Updates Row Level Security policies
   - Restricts game CREATE/UPDATE to authenticated hosts
   - Keeps player operations anonymous
   - Optional payment gating policy (commented out)

4. **`20241119000004_create_host_management_rpcs.sql`**
   - `create_authenticated_game()` - Create game with auth check
   - `check_host_entitlement()` - Check if host can create games
   - `get_host_dashboard()` - Get host statistics
   - `update_host_display_name()` - Update profile
   - Auto-increment player count trigger

## How to Apply Migrations

### Option 1: Supabase CLI (Recommended)

```bash
# Navigate to project root
cd C:\Users\Hopef\Desktop\Fgsh

# Apply all migrations
supabase db push

# Or apply individually
supabase migration up --file supabase/migrations/20241119000001_create_host_profiles.sql
supabase migration up --file supabase/migrations/20241119000002_add_auth_host_to_games.sql
supabase migration up --file supabase/migrations/20241119000003_update_rls_policies_for_auth.sql
supabase migration up --file supabase/migrations/20241119000004_create_host_management_rpcs.sql
```

### Option 2: Supabase Dashboard

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy and paste each migration file **in order**
3. Click **Run** after each file
4. Verify success before moving to next file

### Option 3: Local Development (Supabase Local)

```bash
# Start local Supabase
supabase start

# Apply migrations
supabase db reset

# Migrations auto-apply from supabase/migrations/ directory
```

## Verification

After applying migrations, verify they worked:

```sql
-- 1. Check host_profiles table exists
SELECT * FROM host_profiles LIMIT 1;

-- 2. Check auth_host_id column exists in games
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'games' AND column_name = 'auth_host_id';

-- 3. Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'games';

-- 4. Check RPC functions exist
SELECT proname FROM pg_proc
WHERE proname IN (
  'create_authenticated_game',
  'check_host_entitlement',
  'get_host_dashboard'
);
```

## Supabase Auth Setup

### 1. Enable Email Authentication

In **Supabase Dashboard** → **Authentication** → **Providers**:

1. Enable **Email** provider
2. Configure email templates (optional)
3. Set up SMTP (optional, for custom emails)

### 2. Configure Auth Settings

In **Supabase Dashboard** → **Authentication** → **Settings**:

1. **Site URL**: `http://localhost:5173` (dev) or your production URL
2. **Redirect URLs**: Add your app URLs
3. **JWT Expiry**: Default 3600s (1 hour) is fine
4. **Email Confirmation**: Enable if you want verified emails

### 3. Optional: Enable Other Providers

- Google OAuth
- GitHub OAuth
- Apple
- Magic Links (passwordless)

## Frontend Integration

### 1. Install Supabase Auth Helpers

```bash
npm install @supabase/auth-helpers-react
# or
yarn add @supabase/auth-helpers-react
```

### 2. Wrap App with Auth Provider

```tsx
// App.tsx or main.tsx
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { supabase } from '@fakash/shared';

function App() {
  return (
    <SessionContextProvider supabaseClient={supabase}>
      {/* Your app routes */}
    </SessionContextProvider>
  );
}
```

### 3. Create Login/Signup Pages

```tsx
// LoginPage.tsx
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export const LoginPage = () => {
  const supabase = useSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert(error.message);
  };

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) alert(error.message);
  };

  return (
    <div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleSignup}>Sign Up</button>
    </div>
  );
};
```

### 4. Update GameService.ts

```typescript
// GameService.ts
import { getSupabase } from './supabase';

export class GameService {
  // NEW: Authenticated game creation
  static async createGameAuthenticated(
    hostName: string,
    settings: GameSettings,
    isDisplayMode = false
  ): Promise<{ game: Game; player?: Player }> {
    const supabase = getSupabase();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('You must be logged in to create a game');
    }

    // Generate code
    const code = generateGameCode();

    // Call authenticated RPC
    const { data, error } = await supabase.rpc('create_authenticated_game', {
      p_code: code,
      p_round_count: settings.roundCount,
      p_max_players: settings.maxPlayers,
      p_host_name: isDisplayMode ? null : hostName,
      p_is_display_mode: isDisplayMode,
    });

    if (error) throw error;

    return {
      game: { id: data[0].game_id, code: data[0].game_code, /* ... */ },
      player: data[0].player_id ? { id: data[0].player_id, /* ... */ } : undefined,
    };
  }
}
```

### 5. Protect Create Game Route

```tsx
// CreateGame.tsx
import { useSession } from '@supabase/auth-helpers-react';
import { useNavigate } from 'react-router-dom';

export const CreateGame = () => {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) {
      navigate('/login'); // Redirect to login if not authenticated
    }
  }, [session]);

  const handleCreateGame = async () => {
    // Use new authenticated method
    await GameService.createGameAuthenticated(hostName, settings, isDisplayMode);
  };

  // ... rest of component
};
```

### 6. Check Entitlement (Optional Payment Gate)

```tsx
// CreateGame.tsx
const [canCreate, setCanCreate] = useState(false);
const supabase = useSupabaseClient();

useEffect(() => {
  checkEntitlement();
}, []);

const checkEntitlement = async () => {
  const { data } = await supabase.rpc('check_host_entitlement');
  setCanCreate(data[0]?.can_create_games || false);
};

// Show upgrade prompt if !canCreate
{!canCreate && <UpgradePrompt />}
```

## Optional: Payment Gating

To require payment before creating games:

1. Uncomment the payment policy in `20241119000003_update_rls_policies_for_auth.sql`
2. Set up payment integration (Stripe, etc.)
3. Update `host_profiles.is_paid_host` when payment succeeds
4. Frontend shows "Upgrade" button when entitlement check fails

```sql
-- Enable payment requirement
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;

CREATE POLICY "Only paid hosts can create games"
  ON games FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = auth_host_id
    AND is_host_subscription_active(auth.uid())
  );
```

## Migration Rollback

If you need to rollback (reverse migrations):

```sql
-- Rollback 004: Drop RPCs
DROP FUNCTION IF EXISTS create_authenticated_game CASCADE;
DROP FUNCTION IF EXISTS check_host_entitlement CASCADE;
DROP FUNCTION IF EXISTS get_host_dashboard CASCADE;
DROP FUNCTION IF EXISTS update_host_display_name CASCADE;
DROP FUNCTION IF EXISTS increment_players_hosted_count CASCADE;
DROP TRIGGER IF EXISTS on_player_joined ON players;

-- Rollback 003: Restore permissive policies
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;
DROP POLICY IF EXISTS "Hosts can update own games" ON games;
DROP POLICY IF EXISTS "Hosts can delete own games" ON games;

CREATE POLICY "Anyone can create games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update games" ON games FOR UPDATE USING (true);

-- Rollback 002: Remove auth_host_id
ALTER TABLE games DROP COLUMN IF EXISTS auth_host_id;

-- Rollback 001: Drop host_profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS create_host_profile_on_signup CASCADE;
DROP TABLE IF EXISTS host_profiles CASCADE;
```

## Testing Checklist

After migration and frontend integration:

- [ ] Sign up creates host profile automatically
- [ ] Can't create game without login (redirects to login)
- [ ] Creating game sets `auth_host_id` to current user
- [ ] Regular mode creates both game and player record
- [ ] TV display mode creates game without player
- [ ] First player to join TV mode becomes in-game host
- [ ] Host can only update/delete their own games
- [ ] Players can still join anonymously via code
- [ ] Dashboard shows correct game count and stats
- [ ] Payment gate works (if enabled)

## Support & Troubleshooting

### Common Issues

**Error: "Authentication required"**
- User not logged in - redirect to login page
- Session expired - refresh auth token

**Error: "Active subscription required"**
- Payment policy is enabled
- User needs to upgrade subscription
- Update `host_profiles.is_paid_host = true` to bypass

**RLS Policy Errors**
- Check user is authenticated: `SELECT auth.uid();`
- Verify `auth_host_id` matches: `SELECT * FROM games WHERE auth_host_id = auth.uid();`

**Migration Fails**
- Check if tables already exist
- Run migrations in correct order
- Check Supabase logs for detailed errors

### Debug Queries

```sql
-- Check if user is authenticated
SELECT auth.uid();

-- Get current user's email
SELECT email FROM auth.users WHERE id = auth.uid();

-- List all host profiles
SELECT * FROM host_profiles;

-- List games by auth host
SELECT * FROM games WHERE auth_host_id = auth.uid();

-- Check entitlement
SELECT * FROM check_host_entitlement();
```

## Next Steps

1. Apply migrations to Supabase
2. Enable email auth in dashboard
3. Integrate auth in frontend
4. Test full flow end-to-end
5. (Optional) Set up payment integration
6. Deploy to production

Good luck! 🚀
