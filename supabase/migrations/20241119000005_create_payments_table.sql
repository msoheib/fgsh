-- Migration: Create payments tracking table for Moyasar integration
-- Description: Track all payment transactions and link to host profiles

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Moyasar payment ID (unique identifier from Moyasar)
  moyasar_payment_id VARCHAR(255) UNIQUE NOT NULL,

  -- Link to host profile
  host_id UUID NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,

  -- Payment details
  plan_id VARCHAR(50) NOT NULL, -- 'basic', 'premium', 'lifetime'
  amount INTEGER NOT NULL, -- Amount in halalas (smallest currency unit)
  currency VARCHAR(3) DEFAULT 'SAR',

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'initiated', -- 'initiated' | 'paid' | 'failed' | 'refunded'
  payment_method VARCHAR(50), -- 'creditcard', 'applepay', 'stcpay'

  -- Card/source information (if available)
  card_company VARCHAR(50), -- 'visa', 'mastercard', 'mada'
  card_last_four VARCHAR(4),

  -- Moyasar reference
  moyasar_reference_number VARCHAR(255),
  moyasar_gateway_id VARCHAR(255),

  -- Metadata
  description TEXT,
  failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  refunded_at TIMESTAMP,

  -- Subscription/expiry tracking
  subscription_starts_at TIMESTAMP,
  subscription_expires_at TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_payments_host_id ON payments(host_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_moyasar_id ON payments(moyasar_payment_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_host_status ON payments(host_id, status);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Hosts can view their own payments
CREATE POLICY "Hosts can view own payments"
  ON payments
  FOR SELECT
  USING (host_id = auth.uid());

-- Only service role can insert/update payments (webhook, admin)
CREATE POLICY "Service role can manage payments"
  ON payments
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_timestamp();

-- ============================================================================
-- TRIGGER: Auto-update host_profiles on successful payment
-- ============================================================================

CREATE OR REPLACE FUNCTION process_successful_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_tier VARCHAR(20);
  v_duration INTEGER;
  v_expiry TIMESTAMP;
BEGIN
  -- Only process when status changes to 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    -- Set paid_at timestamp
    NEW.paid_at = NOW();

    -- Determine tier and duration based on plan
    CASE NEW.plan_id
      WHEN 'basic' THEN
        v_tier := 'basic';
        v_duration := 30; -- days
      WHEN 'premium' THEN
        v_tier := 'premium';
        v_duration := 90; -- days
      WHEN 'lifetime' THEN
        v_tier := 'premium';
        v_duration := NULL; -- lifetime
      ELSE
        v_tier := 'basic';
        v_duration := 30;
    END CASE;

    -- Calculate expiry date
    IF v_duration IS NOT NULL THEN
      v_expiry := NOW() + (v_duration || ' days')::INTERVAL;
      NEW.subscription_expires_at = v_expiry;
    ELSE
      NEW.subscription_expires_at = NULL; -- lifetime
    END IF;

    NEW.subscription_starts_at = NOW();

    -- Update host_profiles
    UPDATE host_profiles
    SET
      is_paid_host = TRUE,
      subscription_tier = v_tier,
      subscription_expires_at = v_expiry,
      updated_at = NOW()
    WHERE id = NEW.host_id;

    -- Log the update
    RAISE NOTICE 'Host % upgraded to % tier (expires: %)', NEW.host_id, v_tier, v_expiry;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payment_success
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION process_successful_payment();

COMMENT ON TRIGGER on_payment_success ON payments IS 'Automatically updates host_profiles when payment succeeds';

-- ============================================================================
-- RPC: Create payment record (called from frontend before Moyasar)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_payment_record(
  p_moyasar_payment_id VARCHAR(255),
  p_plan_id VARCHAR(50),
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_host_id UUID;
BEGIN
  -- Get authenticated user
  v_host_id := auth.uid();

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create payment';
  END IF;

  -- Verify host profile exists
  IF NOT EXISTS (SELECT 1 FROM host_profiles WHERE id = v_host_id) THEN
    RAISE EXCEPTION 'Host profile not found';
  END IF;

  -- Create payment record
  INSERT INTO payments (
    id,
    moyasar_payment_id,
    host_id,
    plan_id,
    amount,
    currency,
    status,
    description,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_moyasar_payment_id,
    v_host_id,
    p_plan_id,
    p_amount,
    'SAR',
    'initiated',
    COALESCE(p_description, 'Subscription: ' || p_plan_id),
    NOW()
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_payment_record IS 'Creates a payment record before redirecting to Moyasar. Called from frontend.';

-- ============================================================================
-- RPC: Update payment status (called from webhook)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payment_status(
  p_moyasar_payment_id VARCHAR(255),
  p_status VARCHAR(20),
  p_payment_method VARCHAR(50) DEFAULT NULL,
  p_card_company VARCHAR(50) DEFAULT NULL,
  p_card_last_four VARCHAR(4) DEFAULT NULL,
  p_moyasar_reference VARCHAR(255) DEFAULT NULL,
  p_moyasar_gateway_id VARCHAR(255) DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  -- Update payment record
  UPDATE payments
  SET
    status = p_status,
    payment_method = COALESCE(p_payment_method, payment_method),
    card_company = COALESCE(p_card_company, card_company),
    card_last_four = COALESCE(p_card_last_four, card_last_four),
    moyasar_reference_number = COALESCE(p_moyasar_reference, moyasar_reference_number),
    moyasar_gateway_id = COALESCE(p_moyasar_gateway_id, moyasar_gateway_id),
    failure_reason = COALESCE(p_failure_reason, failure_reason),
    updated_at = NOW(),
    refunded_at = CASE WHEN p_status = 'refunded' THEN NOW() ELSE refunded_at END
  WHERE moyasar_payment_id = p_moyasar_payment_id;

  v_updated := FOUND;

  IF NOT v_updated THEN
    RAISE WARNING 'Payment not found: %', p_moyasar_payment_id;
  END IF;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_payment_status IS 'Updates payment status from Moyasar webhook. Triggers host_profiles update on success.';

-- ============================================================================
-- RPC: Get payment history for authenticated host
-- ============================================================================

CREATE OR REPLACE FUNCTION get_payment_history()
RETURNS TABLE (
  id UUID,
  plan_id VARCHAR(50),
  amount INTEGER,
  currency VARCHAR(3),
  status VARCHAR(20),
  payment_method VARCHAR(50),
  card_company VARCHAR(50),
  card_last_four VARCHAR(4),
  created_at TIMESTAMP,
  paid_at TIMESTAMP,
  subscription_expires_at TIMESTAMP
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.plan_id,
    p.amount,
    p.currency,
    p.status,
    p.payment_method,
    p.card_company,
    p.card_last_four,
    p.created_at,
    p.paid_at,
    p.subscription_expires_at
  FROM payments p
  WHERE p.host_id = auth.uid()
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_payment_history IS 'Returns payment history for the authenticated host.';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE payments IS 'Tracks all Moyasar payment transactions linked to host profiles';
COMMENT ON COLUMN payments.moyasar_payment_id IS 'Unique payment ID from Moyasar (e.g., pay_xxx)';
COMMENT ON COLUMN payments.amount IS 'Payment amount in halalas (1 SAR = 100 halalas)';
COMMENT ON COLUMN payments.status IS 'Payment status: initiated, paid, failed, refunded';
COMMENT ON COLUMN payments.subscription_expires_at IS 'When subscription expires (NULL for lifetime)';
