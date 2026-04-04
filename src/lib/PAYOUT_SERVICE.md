# Payout Service Documentation

## Overview

The Payout Service handles the complete payout lifecycle from initiation through Razorpay test mode to webhook processing. It supports both real Razorpay integration and demo simulation for testing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Payout Service Flow                       │
└─────────────────────────────────────────────────────────────┘

1. Initiate Payout
   ├─ Check if fund account exists
   │  ├─ Yes: Reuse existing fund account
   │  └─ No: Create new fund account
   │     ├─ Create Razorpay contact
   │     └─ Create Razorpay fund account (UPI)
   ├─ Create Razorpay payout
   ├─ Write payout document to Firestore
   └─ Update claim status to "payout_initiated"

2. Webhook Processing
   ├─ Verify webhook signature
   ├─ Find payout document
   └─ Handle event:
      ├─ payout.processed
      │  ├─ Update payout status to "paid"
      │  ├─ Update claim status to "paid"
      │  └─ Update worker payout history
      ├─ payout.failed
      │  ├─ Update payout status to "failed"
      │  └─ Update claim status to "payout_failed"
      └─ payout.reversed
         ├─ Update payout status to "failed"
         └─ Revert claim status to "approved"

3. Demo Simulation (Optional)
   ├─ Create demo payout document
   ├─ Immediately set status to "paid"
   ├─ Update claim status to "paid"
   └─ Update worker payout history
```

## Core Functions

### 1. initiateTestPayout()

Initiates a payout via Razorpay test mode.

**Signature**:
```typescript
async function initiateTestPayout(
  claimId: string,
  workerId: string,
  amountInr: number,
  upiId: string
): Promise<string>
```

**Parameters**:
- `claimId`: Claim document ID
- `workerId`: Worker document ID
- `amountInr`: Payout amount in rupees (minimum ₹1)
- `upiId`: Worker's UPI ID (e.g., "worker@paytm")

**Returns**: Razorpay payout ID

**Process**:
1. Validates inputs
2. Fetches worker document
3. Creates or reuses Razorpay fund account
4. Creates Razorpay payout
5. Writes payout document to Firestore
6. Updates claim status to "payout_initiated"

**Example**:
```typescript
import { initiateTestPayout } from '@/lib/payout';

const razorpayPayoutId = await initiateTestPayout(
  'claim_123',
  'worker_456',
  250,
  'worker@paytm'
);

console.log('Payout initiated:', razorpayPayoutId);
```

**Error Handling**:
- Throws error if inputs are invalid
- Throws error if worker not found
- Throws error if Razorpay API fails
- Updates claim status to "payout_failed" on error

### 2. handlePayoutWebhook()

Processes Razorpay webhook events.

**Signature**:
```typescript
async function handlePayoutWebhook(
  razorpayPayload: any,
  signature: string
): Promise<any>
```

**Parameters**:
- `razorpayPayload`: Webhook payload from Razorpay
- `signature`: Webhook signature header (x-razorpay-signature)

**Returns**: Updated claim document

**Supported Events**:
- `payout.processed`: Payout completed successfully
- `payout.failed`: Payout failed
- `payout.reversed`: Payout was reversed

**Example**:
```typescript
import { handlePayoutWebhook } from '@/lib/payout';

// In webhook handler
const payload = await request.json();
const signature = request.headers.get('x-razorpay-signature');

const updatedClaim = await handlePayoutWebhook(payload, signature);
console.log('Claim updated:', updatedClaim);
```

**Security**:
- Verifies webhook signature using HMAC SHA256
- Rejects webhooks with invalid signatures
- Logs all webhook events

### 3. simulateInstantPayout()

Simulates an instant payout for demo purposes (bypasses Razorpay).

**Signature**:
```typescript
async function simulateInstantPayout(
  claimId: string,
  workerId: string,
  amountInr: number
): Promise<any>
```

**Parameters**:
- `claimId`: Claim document ID
- `workerId`: Worker document ID
- `amountInr`: Payout amount in rupees

**Returns**: Result object with claim data

**Example**:
```typescript
import { simulateInstantPayout } from '@/lib/payout';

const result = await simulateInstantPayout(
  'claim_123',
  'worker_456',
  250
);

console.log('Demo payout:', result);
// {
//   success: true,
//   claim: { ... },
//   payout_id: 'payout_789',
//   demo: true,
//   message: 'Demo payout simulated successfully'
// }
```

**Use Cases**:
- Demo presentations
- Testing without Razorpay
- Development environment
- Admin "Simulate Payout" button

## API Endpoints

### POST /api/payouts/initiate

Initiates a payout via Razorpay.

**Authentication**: Required (Firebase ID token)

**Request Body**:
```json
{
  "claim_id": "claim_123",
  "worker_id": "worker_456",
  "amount_inr": 250,
  "upi_id": "worker@paytm"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Payout initiated successfully",
  "razorpay_payout_id": "pout_abc123",
  "claim_id": "claim_123",
  "worker_id": "worker_456",
  "amount_inr": 250,
  "status": "processing"
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token
- `400 Bad Request`: Invalid inputs or claim not approved
- `404 Not Found`: Claim or worker not found
- `500 Internal Server Error`: Payout initiation failed

**Example**:
```typescript
const response = await fetch('/api/payouts/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    claim_id: 'claim_123',
    worker_id: 'worker_456',
    amount_inr: 250,
    upi_id: 'worker@paytm'
  })
});

const result = await response.json();
console.log(result);
```

### POST /api/payouts/simulate

Simulates an instant payout (demo only).

**Authentication**: Required (Firebase ID token)

**Request Body**:
```json
{
  "claim_id": "claim_123",
  "worker_id": "worker_456",
  "amount_inr": 250
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Demo payout simulated successfully",
  "demo": true,
  "payout_id": "payout_789",
  "claim_id": "claim_123",
  "worker_id": "worker_456",
  "amount_inr": 250,
  "status": "paid",
  "note": "This is a demo simulation — not a real payment"
}
```

**Example**:
```typescript
const response = await fetch('/api/payouts/simulate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    claim_id: 'claim_123',
    worker_id: 'worker_456',
    amount_inr: 250
  })
});

const result = await response.json();
console.log(result);
```

## Firestore Schema

### Payout Document

**Collection**: `payouts`

**Schema**:
```typescript
{
  id: string;                          // Auto-generated
  claim_id: string;                    // Reference to claim
  worker_id: string;                   // Reference to worker
  amount_inr: number;                  // Payout amount in rupees
  upi_id: string;                      // Worker's UPI ID
  razorpay_payout_id: string | null;  // Razorpay payout ID
  razorpay_fund_account_id: string | null; // Razorpay fund account ID
  razorpay_reference_id: string;       // Unique reference ID
  status: 'processing' | 'paid' | 'failed' | 'demo';
  failure_reason: string | null;       // Failure reason if failed
  initiated_at: Timestamp;             // When payout was initiated
  paid_at: Timestamp | null;           // When payout was completed
  notes: string | null;                // Additional notes
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

**Example**:
```json
{
  "id": "payout_789",
  "claim_id": "claim_123",
  "worker_id": "worker_456",
  "amount_inr": 250,
  "upi_id": "worker@paytm",
  "razorpay_payout_id": "pout_abc123",
  "razorpay_fund_account_id": "fa_xyz789",
  "razorpay_reference_id": "claim_123_1234567890",
  "status": "processing",
  "failure_reason": null,
  "initiated_at": "2026-04-04T20:00:00Z",
  "paid_at": null,
  "notes": null,
  "created_at": "2026-04-04T20:00:00Z",
  "updated_at": "2026-04-04T20:00:00Z"
}
```

### Worker Document Updates

**Collection**: `workers`

**Added Fields**:
```typescript
{
  razorpay_fund_account_id: string | null;  // Cached fund account ID
  payout_history: Array<{
    claim_id: string;
    amount_inr: number;
    paid_at: Timestamp;
    razorpay_payout_id?: string;
    demo?: boolean;
  }>;
  total_payouts_received: number;           // Sum of all payouts
}
```

### Claim Document Updates

**Collection**: `claims`

**Added Fields**:
```typescript
{
  payoutId: string | null;  // Reference to payout document
  status: 'payout_initiated' | 'paid' | 'payout_failed' | ...;
}
```

## Razorpay Integration

### Fund Account Creation

**Process**:
1. Create Razorpay contact
2. Create fund account with UPI VPA
3. Cache fund account ID on worker document

**API Calls**:
```
POST /v1/contacts
POST /v1/fund_accounts
```

**Reuse Logic**:
- Fund account is reused if worker's UPI ID hasn't changed
- Stored in `worker.razorpay_fund_account_id`
- Reduces API calls and improves performance

### Payout Creation

**API Call**:
```
POST /v1/payouts
```

**Request**:
```json
{
  "account_number": "2323230000000000",
  "fund_account_id": "fa_xyz789",
  "amount": 25000,
  "currency": "INR",
  "mode": "UPI",
  "purpose": "payout",
  "queue_if_low_balance": true,
  "reference_id": "claim_123_1234567890",
  "narration": "RoziRakshak claim payout - claim_123"
}
```

**Response**:
```json
{
  "id": "pout_abc123",
  "entity": "payout",
  "fund_account_id": "fa_xyz789",
  "amount": 25000,
  "currency": "INR",
  "status": "processing",
  "purpose": "payout",
  "mode": "UPI",
  "reference_id": "claim_123_1234567890",
  "created_at": 1234567890
}
```

### Webhook Events

**Endpoint**: `/api/webhooks/razorpay` (already implemented)

**Events**:
- `payout.processed`: Payout completed
- `payout.failed`: Payout failed
- `payout.reversed`: Payout reversed

**Signature Verification**:
```typescript
const expectedSignature = createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature !== expectedSignature) {
  throw new Error('Invalid signature');
}
```

## Environment Variables

**Required**:
```env
# Razorpay Test Mode Credentials
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
RAZORPAY_ACCOUNT_NUMBER=2323230000000000
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**How to Get**:
1. Sign up at https://razorpay.com
2. Go to Settings > API Keys
3. Switch to Test Mode
4. Generate test API keys
5. Get account number from Settings > Account Details
6. Generate webhook secret from Settings > Webhooks

## Testing

### Test Mode

Razorpay test mode allows testing without real money:
- Use test API keys (prefix: `rzp_test_`)
- Use test UPI IDs (any format works)
- Payouts are simulated
- Webhooks are sent to configured URL

### Test UPI IDs

In test mode, any UPI ID format works:
- `test@paytm`
- `worker123@upi`
- `demo@razorpay`

### Webhook Testing

Use Razorpay Dashboard to send test webhooks:
1. Go to Settings > Webhooks
2. Click "Send Test Webhook"
3. Select event type
4. Send to your webhook URL

### Demo Simulation

For presentations without Razorpay:
```typescript
// Use simulate endpoint
const result = await fetch('/api/payouts/simulate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    claim_id: 'claim_123',
    worker_id: 'worker_456',
    amount_inr: 250
  })
});
```

## Error Handling

### Common Errors

**1. Invalid Razorpay Credentials**
```
Error: Razorpay credentials not configured
Solution: Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_ACCOUNT_NUMBER
```

**2. Fund Account Creation Failed**
```
Error: Failed to create fund account: Invalid VPA
Solution: Check UPI ID format
```

**3. Payout Creation Failed**
```
Error: Razorpay payout failed: Insufficient balance
Solution: Add funds to Razorpay test account
```

**4. Webhook Signature Verification Failed**
```
Error: Invalid webhook signature
Solution: Check RAZORPAY_WEBHOOK_SECRET matches Razorpay dashboard
```

### Error Recovery

**Automatic**:
- Claim status updated to "payout_failed" on error
- Error logged with full context
- Worker can retry from UI

**Manual**:
- Admin can view failed payouts
- Admin can retry payout
- Admin can simulate payout for demo

## Security

### Authentication
- All API endpoints require Firebase ID token
- Token verified before processing

### Authorization
- Only approved claims can be paid out
- Duplicate payout prevention
- Amount validation

### Webhook Security
- Signature verification using HMAC SHA256
- Rejects invalid signatures
- Logs all webhook events

### Data Protection
- Razorpay credentials stored in environment variables
- Never exposed to client
- Fund account IDs cached securely

## Monitoring

### Logs

All operations are logged:
```
[Payout] Initiating test payout: { claimId, workerId, amountInr, upiId }
[Payout] Creating new fund account for UPI: worker@paytm
[Payout] Fund account created: fa_xyz789
[Payout] Razorpay payout created: pout_abc123
[Payout] Payout document created: payout_789
[Payout] Claim updated with payout ID
[Payout Webhook] Processing webhook: { event, payoutId }
[Payout Webhook] Signature verified
[Payout Webhook] Payout found: { payoutId, claimId, event }
[Payout Webhook] Payout document updated to paid
[Payout Webhook] Claim document updated to paid
[Payout Webhook] Worker payout history updated
```

### Metrics to Track

- Payout success rate
- Average payout time
- Failed payout reasons
- Webhook processing time
- Fund account reuse rate

## Best Practices

1. **Always verify claim status** before initiating payout
2. **Cache fund account IDs** to reduce API calls
3. **Verify webhook signatures** to prevent fraud
4. **Log all operations** for debugging
5. **Handle errors gracefully** and update claim status
6. **Use demo simulation** for presentations
7. **Test webhooks** before going live
8. **Monitor payout success rate** in production

## Production Checklist

- [ ] Razorpay account created
- [ ] Test mode API keys configured
- [ ] Webhook URL configured in Razorpay dashboard
- [ ] Webhook secret configured
- [ ] Test payout initiated successfully
- [ ] Webhook received and processed
- [ ] Error handling tested
- [ ] Demo simulation tested
- [ ] Monitoring set up
- [ ] Documentation reviewed
