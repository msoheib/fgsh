# Moyasar Payment Integration Guide

Complete integration of Moyasar payment gateway with Supabase Auth for host subscriptions.

## 📋 Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Database Migrations](#database-migrations)
3. [Webhook Configuration](#webhook-configuration)
4. [Frontend Integration](#frontend-integration)
5. [Testing](#testing)
6. [Deployment](#deployment)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Setup & Configuration

### 1. Get Moyasar API Keys

1. Sign up at [Moyasar Dashboard](https://dashboard.moyasar.com/)
2. Navigate to **Settings** → **API Keys**
3. Copy your keys:
   - **Publishable Key**: `pk_test_...` (for frontend)
   - **Secret Key**: `sk_test_...` (for backend/webhooks)

### 2. Configure Environment Variables

**Frontend** (`.env` in `packages/web`):
```bash
VITE_MOYASAR_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxx
VITE_APP_URL=http://localhost:5173  # Your app URL
```

**Backend** (Supabase Dashboard → Project Settings → Edge Functions):
```bash
MOYASAR_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxx
```

---

## 🗄️ Database Migrations

### Apply Migrations

Apply these migrations **in order** (after the auth migrations):

```bash
# Apply payment tracking migration
supabase migration up --file supabase/migrations/20241119000005_create_payments_table.sql
```

**Or via Supabase Dashboard:**
1. Go to **SQL Editor**
2. Copy and paste `20241119000005_create_payments_table.sql`
3. Click **Run**

### Verify Migration

```sql
-- Check payments table exists
SELECT * FROM payments LIMIT 1;

-- Check RPC functions exist
SELECT proname FROM pg_proc WHERE proname IN (
  'create_payment_record',
  'update_payment_status',
  'get_payment_history'
);

-- Test payment record creation (as authenticated user)
SELECT create_payment_record(
  'test_payment_123',
  'basic',
  4900,
  'Test payment'
);
```

---

## 🔗 Webhook Configuration

### 1. Deploy Edge Function

```bash
# Deploy the webhook handler
supabase functions deploy moyasar-webhook

# Get the function URL (copy this)
https://<your-project-ref>.supabase.co/functions/v1/moyasar-webhook
```

### 2. Configure Webhook in Moyasar Dashboard

1. Go to [Moyasar Dashboard](https://dashboard.moyasar.com/) → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **Webhook URL**: `https://<your-project-ref>.supabase.co/functions/v1/moyasar-webhook`
   - **Events**: Select:
     - ✅ `payment.paid`
     - ✅ `payment.failed`
     - ✅ `payment.refunded`
4. Click **Save**

### 3. Test Webhook

```bash
# Monitor webhook logs
supabase functions logs moyasar-webhook --tail

# Make a test payment (see Testing section)
# Watch logs for webhook delivery
```

---

## 💻 Frontend Integration

### 1. Install Dependencies

Already included in the monorepo. Moyasar uses CDN script (loaded automatically).

### 2. Add Payment Route

**In `packages/web/src/App.tsx` or your router:**

```tsx
import { PaymentCallback } from './pages/PaymentCallback';
import { UpgradeModal } from './components/payment/UpgradeModal';

// Add route
<Route path="/payment/callback" element={<PaymentCallback />} />

// Or use modal on any page:
const [showUpgrade, setShowUpgrade] = useState(false);

<UpgradeModal
  isOpen={showUpgrade}
  onClose={() => setShowUpgrade(false)}
  currentTier="free"
/>
```

### 3. Add Upgrade Button to Host Dashboard

```tsx
import { useState, useEffect } from 'react';
import { PaymentService } from '@fakash/shared';
import { UpgradeModal } from '../components/payment/UpgradeModal';
import { GradientButton } from '../components/GradientButton';

export const HostDashboard = () => {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [entitlement, setEntitlement] = useState(null);

  useEffect(() => {
    checkEntitlement();
  }, []);

  const checkEntitlement = async () => {
    const result = await PaymentService.checkHostEntitlement();
    setEntitlement(result);
  };

  return (
    <div>
      {/* Show upgrade button if not paid */}
      {entitlement && !entitlement.can_create_games && (
        <GradientButton
          variant="pink"
          onClick={() => setShowUpgrade(true)}
        >
          ⭐ ترقية الحساب
        </GradientButton>
      )}

      {/* Show subscription status if paid */}
      {entitlement && entitlement.can_create_games && (
        <div className="glass p-4 rounded-2xl">
          <p>✅ حساب مفعل - {entitlement.subscription_tier}</p>
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentTier={entitlement?.subscription_tier}
      />
    </div>
  );
};
```

### 4. Gate Game Creation (Optional)

**In `CreateGame.tsx`:**

```tsx
import { useEffect, useState } from 'react';
import { PaymentService } from '@fakash/shared';
import { useNavigate } from 'react-router-dom';

export const CreateGame = () => {
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const entitlement = await PaymentService.checkHostEntitlement();

      // Uncomment to enforce payment requirement
      // if (!entitlement || !entitlement.can_create_games) {
      //   alert('يرجى ترقية حسابك لإنشاء الألعاب');
      //   navigate('/');
      //   return;
      // }

      setCanCreate(true);
    } catch (error) {
      console.error('Failed to check access:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    // ... your create game form
  );
};
```

---

## 🧪 Testing

### Test Cards

**Successful Payment:**
- Card: `4111 1111 1111 1111`
- CVV: Any 3 digits (e.g., `123`)
- Expiry: Any future date (e.g., `12/25`)
- Name: Any name

**Failed Payment:**
- Card: `4000 0000 0000 0002`
- CVV: Any
- Expiry: Any future date

### Test Flow

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Sign up/Login** as a host

3. **Click "Upgrade Account"** button

4. **Select a plan** (e.g., Basic - 49 SAR)

5. **Enter test card** details:
   - Card: `4111 1111 1111 1111`
   - CVV: `123`
   - Expiry: `12/25`
   - Name: `Test User`

6. **Complete payment** (may redirect to 3D Secure page)

7. **Verify:**
   - You're redirected to `/payment/callback`
   - Success message appears
   - Check database:
     ```sql
     SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;
     SELECT * FROM host_profiles WHERE id = auth.uid();
     ```
   - `is_paid_host` should be `true`
   - `subscription_tier` should match your plan

### Monitor Webhook Delivery

```bash
# Terminal 1: Watch webhook logs
supabase functions logs moyasar-webhook --tail

# Terminal 2: Check Moyasar Dashboard
# Go to Webhooks → View deliveries
# Should show 200 OK responses
```

### Verify Database Updates

```sql
-- Check latest payment
SELECT
  p.*,
  hp.subscription_tier,
  hp.is_paid_host,
  hp.subscription_expires_at
FROM payments p
JOIN host_profiles hp ON hp.id = p.host_id
WHERE p.moyasar_payment_id = 'YOUR_PAYMENT_ID'
ORDER BY p.created_at DESC
LIMIT 1;

-- Check trigger worked
SELECT * FROM host_profiles WHERE is_paid_host = true;
```

---

## 🚀 Deployment

### 1. Update Environment Variables

**Frontend (Vercel/Netlify):**
```bash
VITE_MOYASAR_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxx
VITE_APP_URL=https://yourdomain.com
```

**Backend (Supabase Dashboard):**
```bash
MOYASAR_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxx
```

### 2. Deploy Edge Function

```bash
# Deploy to production
supabase functions deploy moyasar-webhook --project-ref <your-project-ref>
```

### 3. Update Moyasar Webhook URL

1. Go to Moyasar Dashboard → Webhooks
2. Update webhook URL to production:
   ```
   https://<your-project-ref>.supabase.co/functions/v1/moyasar-webhook
   ```

### 4. Switch to Live API Keys

1. Get live API keys from Moyasar Dashboard
2. Update all environment variables
3. Test with real card (small amount first!)

---

## 🐛 Troubleshooting

### Issue: "Moyasar publishable key not configured"

**Solution:**
- Check `.env` file has `VITE_MOYASAR_PUBLISHABLE_KEY`
- Restart dev server after adding env variables
- Verify key starts with `pk_test_` or `pk_live_`

### Issue: Payment succeeds but host not upgraded

**Check:**
1. Webhook is configured and receiving events:
   ```bash
   supabase functions logs moyasar-webhook --tail
   ```

2. Payment record exists in database:
   ```sql
   SELECT * FROM payments WHERE moyasar_payment_id = 'YOUR_PAYMENT_ID';
   ```

3. Trigger executed successfully:
   ```sql
   SELECT * FROM host_profiles WHERE id = (
     SELECT host_id FROM payments WHERE moyasar_payment_id = 'YOUR_PAYMENT_ID'
   );
   ```

4. Check Supabase logs for errors:
   - Go to Supabase Dashboard → Logs → Functions

**Manual Fix:**
```sql
-- If webhook missed, manually update:
UPDATE payments
SET status = 'paid'
WHERE moyasar_payment_id = 'YOUR_PAYMENT_ID';
-- Trigger will auto-update host_profiles
```

### Issue: "Authentication required" error

**Solution:**
- User must be logged in with Supabase Auth
- Check session is valid:
  ```tsx
  const { data: { user } } = await supabase.auth.getUser();
  console.log('User:', user);
  ```

### Issue: Webhook returns 500 error

**Check:**
1. Edge function deployed:
   ```bash
   supabase functions list
   ```

2. Environment variables set (Supabase Dashboard → Edge Functions → Settings)

3. Check function logs for detailed error:
   ```bash
   supabase functions logs moyasar-webhook --tail
   ```

### Issue: Payment callback shows error

**Solutions:**
1. Check callback URL includes `?id=PAYMENT_ID`
2. Verify payment exists in Moyasar:
   - Go to Moyasar Dashboard → Payments
   - Find payment ID
   - Check status

3. Verify Moyasar API is accessible:
   ```bash
   curl -u "pk_test_xxx:" https://api.moyasar.com/v1/payments/PAYMENT_ID
   ```

---

## 📊 Payment Plans

Current plans configured in `moyasar.ts`:

| Plan | Price | Duration | Tier |
|------|-------|----------|------|
| Basic | 49 SAR | 30 days | basic |
| Premium | 99 SAR | 90 days | premium |
| Lifetime | 299 SAR | Forever | premium |

To modify plans, edit:
```typescript
// packages/shared/src/config/moyasar.ts
PLANS: {
  BASIC: {
    price: 49,
    priceHalalas: 4900,
    // ...
  },
}
```

---

## 🔐 Security Best Practices

1. **Never expose secret key** in frontend code
2. **Verify payments server-side** (webhook + callback)
3. **Use HTTPS** in production only
4. **Validate webhook source** (check payment exists before processing)
5. **Log all payment events** for audit trail
6. **Handle refunds gracefully** (webhook updates automatically)
7. **Test thoroughly** before going live

---

## 📞 Support

- **Moyasar Docs**: https://docs.moyasar.com/
- **Moyasar Support**: support@moyasar.com
- **Supabase Docs**: https://supabase.com/docs
- **Your Support**: support@fakash.com

---

## ✅ Integration Checklist

- [ ] Moyasar account created
- [ ] API keys obtained and configured
- [ ] Database migration applied
- [ ] Edge function deployed
- [ ] Webhook configured in Moyasar Dashboard
- [ ] Frontend components integrated
- [ ] Payment callback route added
- [ ] Test payment completed successfully
- [ ] Webhook delivery verified
- [ ] Host profile upgraded automatically
- [ ] Production environment variables set
- [ ] Live API keys configured
- [ ] Production webhook URL updated
- [ ] Real payment tested (small amount)

---

Good luck with your payment integration! 🚀💰
