# Payout Service - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Configure Environment Variables

Add to `.env.local`:

```env
# Razorpay Test Mode
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
RAZORPAY_ACCOUNT_NUMBER=2323230000000000
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**Get Razorpay Credentials**:
1. Sign up at https://razorpay.com
2. Go to Settings > API Keys
3. Switch to Test Mode
4. Generate test keys

### Step 2: Initiate a Payout

```typescript
import { initiateTestPayout } from '@/lib/payout';

const razorpayPayoutId = await initiateTestPayout(
  'claim_123',      // Claim ID
  'worker_456',     // Worker ID
  250,              // Amount in rupees
  'worker@paytm'    // UPI ID
);

console.log('Payout initiated:', razorpayPayoutId);
```

### Step 3: Handle Webhooks

Webhook endpoint already implemented at `/api/webhooks/razorpay`

Configure in Razorpay Dashboard:
1. Go to Settings > Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhooks/razorpay`
3. Select events: `payout.processed`, `payout.failed`, `payout.reversed`
4. Copy webhook secret to `.env.local`

### Step 4: Test with Demo Simulation

```typescript
import { simulateInstantPayout } from '@/lib/payout';

const result = await simulateInstantPayout(
  'claim_123',
  'worker_456',
  250
);

console.log('Demo payout:', result);
```

## 📋 Common Use Cases

### Use Case 1: Initiate Payout from API

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
```

### Use Case 2: Simulate Payout for Demo

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
```

### Use Case 3: Check Payout Status

```typescript
import { adminDb } from '@/lib/firebase-admin';

const payoutDoc = await adminDb.collection('payouts').doc(payoutId).get();
const payout = payoutDoc.data();

console.log('Status:', payout.status);
console.log('Amount:', payout.amount_inr);
console.log('Paid at:', payout.paid_at);
```

### Use Case 4: Get Worker Payout History

```typescript
import { adminDb } from '@/lib/firebase-admin';

const workerDoc = await adminDb.collection('workers').doc(workerId).get();
const worker = workerDoc.data();

console.log('Payout history:', worker.payout_history);
console.log('Total received:', worker.total_payouts_received);
```

## 🎨 React Component Example

```tsx
'use client';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';

export default function PayoutButton({ claim }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const handlePayout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const token = await user.getIdToken();
      
      const response = await fetch('/api/payouts/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          claim_id: claim.id,
          worker_id: claim.workerId,
          amount_inr: claim.payoutAmount,
          upi_id: claim.worker.upiId
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      
      setSuccess(true);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <button
        onClick={handlePayout}
        disabled={loading || claim.status !== 'approved'}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        {loading ? 'Processing...' : 'Initiate Payout'}
      </button>
      
      {error && <p className="text-red-600">{error}</p>}
      {success && <p className="text-green-600">Payout initiated!</p>}
    </div>
  );
}
```

## 🔧 Troubleshooting

### Issue 1: "Razorpay credentials not configured"

**Solution**: Add credentials to `.env.local`:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
RAZORPAY_ACCOUNT_NUMBER=2323230000000000
```

### Issue 2: "Failed to create fund account"

**Solution**: Check UPI ID format. In test mode, any format works:
- `test@paytm`
- `worker@upi`
- `demo@razorpay`

### Issue 3: "Invalid webhook signature"

**Solution**: Verify webhook secret matches Razorpay dashboard:
```env
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### Issue 4: "Claim not approved"

**Solution**: Claim must be in `approved` or `auto_approved` status before payout.

## 📊 Payout Status Flow

```
pending_fraud_check
        ↓
   approved
        ↓
payout_initiated  ←─ initiateTestPayout()
        ↓
   processing     ←─ Razorpay processing
        ↓
      paid         ←─ payout.processed webhook
```

## 🎯 Best Practices

1. **Always check claim status** before initiating payout
2. **Cache fund account IDs** (automatically done)
3. **Verify webhook signatures** (automatically done)
4. **Log all operations** (automatically done)
5. **Handle errors gracefully** (automatically done)
6. **Use demo simulation** for presentations
7. **Test webhooks** before going live

## 📈 Monitoring

### Check Payout Success Rate

```typescript
const payouts = await adminDb.collection('payouts').get();
const total = payouts.size;
const paid = payouts.docs.filter(d => d.data().status === 'paid').length;
const successRate = (paid / total) * 100;

console.log(`Success rate: ${successRate}%`);
```

### Check Failed Payouts

```typescript
const failedPayouts = await adminDb
  .collection('payouts')
  .where('status', '==', 'failed')
  .get();

failedPayouts.forEach(doc => {
  const payout = doc.data();
  console.log('Failed:', payout.claim_id, payout.failure_reason);
});
```

## 🚦 Testing Checklist

- [ ] Environment variables configured
- [ ] Test payout initiated successfully
- [ ] Payout document created in Firestore
- [ ] Claim status updated to "payout_initiated"
- [ ] Webhook received and processed
- [ ] Payout status updated to "paid"
- [ ] Claim status updated to "paid"
- [ ] Worker payout history updated
- [ ] Demo simulation tested
- [ ] Error handling tested

## 📚 Additional Resources

- [Full Documentation](./PAYOUT_SERVICE.md)
- [Usage Examples](./payout-example.ts)
- [Implementation Summary](../PAYOUT_IMPLEMENTATION.md)
- [Razorpay API Docs](https://razorpay.com/docs/api/payouts/)

## 💡 Quick Tips

- **Test Mode**: Use `rzp_test_` prefix for test keys
- **UPI IDs**: Any format works in test mode
- **Webhooks**: Test using Razorpay dashboard
- **Demo**: Use `/api/payouts/simulate` for instant demo
- **Logs**: Check console for detailed operation logs
- **Status**: Check Firestore for real-time status updates

## 🎉 You're Ready!

You now have a fully functional payout service. Start by:
1. Configuring environment variables
2. Initiating a test payout
3. Verifying webhook processing
4. Testing demo simulation

For detailed documentation, see [PAYOUT_SERVICE.md](./PAYOUT_SERVICE.md)
