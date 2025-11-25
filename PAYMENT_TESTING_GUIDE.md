# Payment Testing Guide

## Overview

Complete guide for testing the Moyasar payment integration in development and production.

---

## ✅ What Was Fixed

1. **429 Rate Limit Errors** → Added exponential backoff retry logic (2s, 4s delays)
2. **Double API Calls** → Added `useRef` to prevent duplicate verification in PaymentCallback
3. **Database Not Updating** → Added `updatePaymentStatus()` call to trigger host_profiles update
4. **Poor Error Messages** → Added detailed console logging for debugging
5. **Test Mode** → Added DEV mode bypass for manual testing

---

## 🧪 Testing Methods

### Method 1: Moyasar Test Cards (Recommended for Production Testing)

**Test Cards**:
- ✅ **Success**: `4111 1111 1111 1111`
- ❌ **Failure**: `4000 0000 0000 0002`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

**Steps**:
1. Sign in to your account
2. Navigate to `/create`
3. Click "إنشاء غرفة" → Upgrade modal appears
4. Select a plan (Basic/Premium/Lifetime)
5. Enter test card details
6. Click pay
7. You'll be redirected to `/payment/callback?id=pay_xxx`
8. Check console for logs starting with `[PaymentCallback]`

**Expected Console Output**:
```
[PaymentCallback] Starting verification for payment: pay_xxx
Payment verified successfully: pay_xxx Status: paid
[PaymentCallback] Payment verified. Status: paid
[PaymentCallback] Updating database with status: paid
[PaymentCallback] Database update result: true
[PaymentCallback] ✅ Payment successful! Database trigger should have updated host_profiles.
```

---

### Method 2: DEV Mode Manual Testing (For Development)

**When to Use**:
- Moyasar API is down or rate-limited
- You want to test database triggers without actual payments
- Rapid testing iterations

**How to Use**:
1. Make sure you're running in development mode (`npm run dev`)
2. Create a payment record manually in Supabase with a `test_` prefix:
   ```sql
   INSERT INTO payments (moyasar_payment_id, host_id, plan_id, amount, currency, status)
   VALUES ('test_12345', auth.uid(), 'basic', 4900, 'SAR', 'initiated');
   ```
3. Navigate to: `/payment/callback?id=test_12345`
4. The system will automatically mark it as paid and update your profile

**Expected Behavior**:
- Console shows: `🧪 DEV MODE: Forcing test payment success`
- Success message appears
- `host_profiles.is_paid_host` becomes `true`
- `host_profiles.subscription_tier` updates to plan tier

---

## 🔍 Debugging Failed Payments

### Check 1: Console Logs

Open browser DevTools → Console, look for:
```
[PaymentCallback] Starting verification for payment: pay_xxx
```

**Common Issues**:
- ❌ No logs → `useEffect` not running (check `verificationAttempted.current`)
- ❌ `429 Too Many Requests` → Retry logic should kick in (wait 2-4 seconds)
- ❌ `Payment status: initiated` → Payment not yet processed by Moyasar
- ❌ Database update fails → Check Supabase logs and RPC function

### Check 2: Supabase Database

**Query 1: Check Payment Record**
```sql
SELECT * FROM payments
WHERE moyasar_payment_id = 'pay_xxx';
```

**Expected**:
- `status` should be `'paid'`
- `paid_at` should have a timestamp
- `subscription_expires_at` should be set

**Query 2: Check Host Profile**
```sql
SELECT id, is_paid_host, subscription_tier, subscription_expires_at
FROM host_profiles
WHERE id = auth.uid();
```

**Expected**:
- `is_paid_host` = `true`
- `subscription_tier` = `'basic'` or `'premium'`
- `subscription_expires_at` = future date (or NULL for lifetime)

### Check 3: Network Tab

DevTools → Network → Filter for `moyasar.com`

**Expected**:
- 1-2 requests to `https://api.moyasar.com/v1/payments/pay_xxx`
- Status: `200 OK` or `429 Too Many Requests` (followed by retry)
- Response should show `"status": "paid"`

### Check 4: Supabase RPC Logs

In Supabase Dashboard → SQL Editor:
```sql
-- Check if trigger fired
SELECT * FROM payments
WHERE moyasar_payment_id = 'pay_xxx'
ORDER BY updated_at DESC LIMIT 1;

-- Check host profile update
SELECT * FROM host_profiles
WHERE id = auth.uid();
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Payment successful but still redirected to upgrade"

**Cause**: `checkHostEntitlement()` returning false after payment

**Solution**:
1. Check `host_profiles` in Supabase (see Check 2 above)
2. Verify `is_paid_host = true`
3. Clear browser cache and refresh
4. Check if `checkSession()` was called after payment

**Manual Fix**:
```sql
UPDATE host_profiles
SET is_paid_host = true,
    subscription_tier = 'basic',
    subscription_expires_at = NOW() + INTERVAL '30 days'
WHERE id = auth.uid();
```

### Issue 2: "Error 429 Too Many Requests"

**Cause**: Too many API calls to Moyasar in short time

**Solution**:
- ✅ Already fixed with retry logic + `useRef`
- Wait 5-10 seconds between tests
- Use DEV mode for rapid testing (Method 2 above)

### Issue 3: "Payment not found in database"

**Cause**: Payment record not created before Moyasar redirect

**Solution**:
1. Check that `createPaymentRecord()` was called in `MoyasarPaymentForm`
2. Verify payment record exists:
   ```sql
   SELECT * FROM payments WHERE host_id = auth.uid() ORDER BY created_at DESC LIMIT 5;
   ```
3. If missing, payment flow was interrupted - try again

### Issue 4: "Database trigger not firing"

**Cause**: Trigger `process_successful_payment` not working

**Solution**:
1. Check trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_payment_success';
   ```
2. Test trigger manually:
   ```sql
   UPDATE payments
   SET status = 'paid'
   WHERE moyasar_payment_id = 'pay_xxx';
   ```
3. Check Supabase logs for errors

---

## 📊 Testing Checklist

### Pre-Payment
- [ ] User is signed in (`authStore.user` is set)
- [ ] User has a `host_profiles` record
- [ ] Moyasar publishable key is configured (`VITE_MOYASAR_PUBLISHABLE_KEY`)

### During Payment
- [ ] Payment form is visible with correct styling (white background, dark text)
- [ ] Test card details are accepted
- [ ] Loading spinner appears
- [ ] No 429 errors in console
- [ ] Redirects to `/payment/callback?id=pay_xxx`

### Post-Payment
- [ ] Success message appears
- [ ] Console shows `✅ Payment successful!`
- [ ] Database `payments.status = 'paid'`
- [ ] Database `host_profiles.is_paid_host = true`
- [ ] Navigate to `/create` → No upgrade modal
- [ ] Can create games successfully

---

## 🚀 Production Deployment

### Environment Variables

**Web (.env.local)**:
```env
VITE_MOYASAR_PUBLISHABLE_KEY=pk_live_xxxxx  # Get from Moyasar dashboard
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

**Webhook (Optional - for webhook handler)**:
```env
MOYASAR_SECRET_KEY=sk_live_xxxxx  # Keep secret!
```

### Database Migrations

Run all migrations in order:
1. `20241119000001_create_host_profiles.sql`
2. `20241119000002_add_auth_host_to_games.sql`
3. `20241119000003_update_rls_policies_for_auth.sql`
4. `20241119000004_create_host_management_rpcs.sql`
5. `20241119000005_create_payments_table.sql`
6. `20241119000006_add_update_display_name_rpc.sql`

### Moyasar Dashboard Setup

1. Go to [Moyasar Dashboard](https://moyasar.com/dashboard)
2. Get your **Live** publishable key
3. Set up webhook URL (optional): `https://your-domain.com/api/webhooks/moyasar`
4. Configure allowed callback URLs: `https://your-domain.com/payment/callback`

---

## 📝 Manual Database Testing

If you want to manually test the full flow without Moyasar:

```sql
-- 1. Create a test payment
INSERT INTO payments (
  moyasar_payment_id,
  host_id,
  plan_id,
  amount,
  currency,
  status,
  created_at
) VALUES (
  'test_manual_001',
  auth.uid(),
  'basic',
  4900,
  'SAR',
  'initiated',
  NOW()
);

-- 2. Mark it as paid (this triggers the host_profiles update)
UPDATE payments
SET status = 'paid',
    paid_at = NOW()
WHERE moyasar_payment_id = 'test_manual_001';

-- 3. Verify host profile was updated
SELECT id, is_paid_host, subscription_tier, subscription_expires_at
FROM host_profiles
WHERE id = auth.uid();
```

---

## 🎯 Success Criteria

A payment is considered **successfully processed** when:

1. ✅ `payments.status = 'paid'`
2. ✅ `payments.paid_at` is set
3. ✅ `host_profiles.is_paid_host = true`
4. ✅ `host_profiles.subscription_tier` matches plan
5. ✅ `host_profiles.subscription_expires_at` is set (or NULL for lifetime)
6. ✅ `checkHostEntitlement()` returns `{ can_create_games: true }`
7. ✅ User can access `/create` without seeing upgrade modal

---

**Last Updated**: 2024-11-20
**Status**: ✅ All payment flows implemented and tested
