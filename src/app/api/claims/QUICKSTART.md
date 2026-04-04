# Claims API - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Authentication Setup

All endpoints require Firebase authentication. Get your ID token:

```typescript
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const user = auth.currentUser;
const idToken = await user.getIdToken();
```

### Step 2: Initiate a Manual Claim

```typescript
const response = await fetch('/api/claims/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    trigger_type: 'heavy_rain',
    trigger_severity: 'moderate',
    zone: 'zone_mumbai_central',
    description: 'Heavy rainfall prevented me from working during my shift'
  })
});

const result = await response.json();
console.log('Claim ID:', result.claim_id);
// Output: { success: true, claim_id: "claim_abc123", status: "pending_fraud_check" }
```

### Step 3: Check Claim Status

```typescript
const response = await fetch(`/api/claims/${claimId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${idToken}`
  }
});

const claim = await response.json();
console.log('Status:', claim.status);
console.log('Payout:', claim.payoutAmount);
```

### Step 4: Appeal a Held Claim (if needed)

```typescript
const response = await fetch(`/api/claims/${claimId}/appeal`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'I was actually in the affected zone during the trigger event',
    additional_context: 'I have GPS logs and photos showing I was at the location'
  })
});

const result = await response.json();
console.log(result.message);
// Output: "Your appeal has been submitted successfully"
```

## 📋 Common Use Cases

### Use Case 1: Worker Initiates Claim

```typescript
async function initiateManualClaim(data: {
  trigger_type: string;
  trigger_severity: 'moderate' | 'high' | 'severe';
  zone: string;
  description: string;
}) {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  
  const response = await fetch('/api/claims/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
}

// Usage
const result = await initiateManualClaim({
  trigger_type: 'heavy_rain',
  trigger_severity: 'moderate',
  zone: 'zone_mumbai_central',
  description: 'Heavy rainfall prevented me from working'
});
```

### Use Case 2: Admin Reviews Claim

```typescript
async function reviewClaim(
  claimId: string,
  decision: 'approve' | 'reject',
  adminNote: string
) {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  
  const response = await fetch(`/api/claims/${claimId}/review`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      decision,
      admin_note: adminNote
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
}

// Usage
await reviewClaim(
  'claim_abc123',
  'approve',
  'Verified with external weather data. Claim is legitimate.'
);
```

### Use Case 3: Worker Appeals Claim

```typescript
async function appealClaim(
  claimId: string,
  reason: string,
  context: string
) {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  
  const response = await fetch(`/api/claims/${claimId}/appeal`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason,
      additional_context: context
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
}

// Usage
await appealClaim(
  'claim_abc123',
  'I was in the affected zone during the event',
  'I have GPS logs and photos as evidence'
);
```

## 🎨 React Component Examples

### Manual Claim Form

```tsx
'use client';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';

export default function ManualClaimForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const formData = new FormData(e.currentTarget);
    
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/claims/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          trigger_type: formData.get('trigger_type'),
          trigger_severity: formData.get('trigger_severity'),
          zone: formData.get('zone'),
          description: formData.get('description')
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      
      setSuccess(true);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>Trigger Type</label>
        <select name="trigger_type" required>
          <option value="heavy_rain">Heavy Rain</option>
          <option value="hazardous_aqi">Hazardous AQI</option>
          <option value="extreme_heat">Extreme Heat</option>
        </select>
      </div>
      
      <div>
        <label>Severity</label>
        <select name="trigger_severity" required>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
          <option value="severe">Severe</option>
        </select>
      </div>
      
      <div>
        <label>Zone</label>
        <input name="zone" type="text" required />
      </div>
      
      <div>
        <label>Description</label>
        <textarea name="description" required />
      </div>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit Claim'}
      </button>
      
      {error && <p className="text-red-600">{error}</p>}
      {success && <p className="text-green-600">Claim submitted!</p>}
    </form>
  );
}
```

### Claim Details View

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';

export default function ClaimDetails({ claimId }: { claimId: string }) {
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchClaim() {
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        
        const response = await fetch(`/api/claims/${claimId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const data = await response.json();
        setClaim(data);
        
      } catch (error) {
        console.error('Failed to fetch claim:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchClaim();
  }, [claimId]);
  
  if (loading) return <div>Loading...</div>;
  if (!claim) return <div>Claim not found</div>;
  
  return (
    <div className="space-y-4">
      <h2>Claim Details</h2>
      
      <div>
        <strong>Status:</strong> {claim.status}
      </div>
      
      <div>
        <strong>Type:</strong> {claim.triggerType}
      </div>
      
      <div>
        <strong>Severity:</strong> {claim.triggerSeverity}
      </div>
      
      <div>
        <strong>Zone:</strong> {claim.zone}
      </div>
      
      <div>
        <strong>Description:</strong> {claim.description}
      </div>
      
      {claim.payoutAmount > 0 && (
        <div>
          <strong>Payout:</strong> ₹{claim.payoutAmount}
        </div>
      )}
      
      {claim.holdReason && (
        <div className="text-red-600">
          <strong>Hold Reason:</strong> {claim.holdReason}
        </div>
      )}
    </div>
  );
}
```

## 🔧 Troubleshooting

### Issue 1: "Unauthorized" Error

**Problem**: Missing or invalid Firebase token

**Solution**:
```typescript
// Make sure user is signed in
const auth = getAuth();
const user = auth.currentUser;

if (!user) {
  // Redirect to login
  router.push('/login');
  return;
}

// Get fresh token
const token = await user.getIdToken(true); // Force refresh
```

### Issue 2: "No Active Policy" Error

**Problem**: Worker doesn't have active policy for current week

**Solution**: Worker must purchase a policy before initiating claims

### Issue 3: "Max Claims Exceeded" Error

**Problem**: Worker has reached max claims for the week

**Solution**: Wait until next week or contact support

### Issue 4: "Rate Limit Exceeded" Error

**Problem**: Too many manual claim attempts (>3 in 24 hours)

**Solution**: Wait for the retry_after period (returned in response)

### Issue 5: "Access Denied" Error

**Problem**: Trying to access another worker's claim

**Solution**: Workers can only access their own claims

## 📊 Claim Status Reference

| Status | Description | Next Action |
|--------|-------------|-------------|
| `pending_fraud_check` | Claim created, awaiting processing | Wait for orchestrator |
| `auto_approved` | Automatically approved (Track A) | Payout initiated |
| `under_review` | Needs admin review (Track B) | Admin reviews |
| `held` | Held for review (Track C) | Worker can appeal |
| `approved` | Admin approved | Payout initiated |
| `rejected` | Admin rejected | Worker can appeal |
| `under_appeal` | Worker appealed | Admin reviews appeal |
| `payout_initiated` | Payout in progress | Wait for completion |
| `paid` | Payout completed | Done |
| `payout_failed` | Payout failed | Contact support |

## 🎯 Best Practices

1. **Always check claim status** before taking action
2. **Handle rate limits gracefully** - show retry timer to user
3. **Validate inputs** before sending to API
4. **Show loading states** during API calls
5. **Display error messages** clearly to users
6. **Cache claim data** to reduce API calls
7. **Use optimistic updates** for better UX

## 📈 Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `/api/claims/initiate` | 3 | 24 hours | Per worker |

**Handling Rate Limits**:
```typescript
try {
  const response = await fetch('/api/claims/initiate', { ... });
  
  if (response.status === 429) {
    const error = await response.json();
    const retryAfter = error.retry_after; // seconds
    
    // Show message to user
    alert(`Please wait ${Math.ceil(retryAfter / 3600)} hours before trying again`);
  }
} catch (error) {
  // Handle error
}
```

## 🔐 Security Notes

- Never expose Firebase tokens in logs
- Always use HTTPS in production
- Validate all inputs on client side
- Handle errors gracefully
- Don't expose internal error details to users

## 📚 Additional Resources

- [Full API Documentation](./README.md)
- [Implementation Summary](../../../CLAIMS_API_IMPLEMENTATION.md)
- [Firebase Auth Docs](https://firebase.google.com/docs/auth)

## 💡 Quick Tips

- **Test Mode**: Use test Firebase project for development
- **Error Codes**: Check error.code for programmatic handling
- **Logging**: All state transitions are logged in claimLogs collection
- **Admin Role**: Set custom claims in Firebase for admin users
- **Notifications**: Integrate with FCM for push notifications

## 🎉 You're Ready!

You now have everything you need to integrate the Claims API. Start by:
1. Authenticating with Firebase
2. Initiating a manual claim
3. Checking claim status
4. Handling appeals if needed

For detailed documentation, see [README.md](./README.md)
