# Claims Management API Documentation

## Overview

Complete API endpoints for claim management including initiation, retrieval, review, and appeals. All endpoints require Firebase authentication and implement proper authorization checks.

## Endpoints

### 1. POST /api/claims/initiate

Allows workers to manually initiate claims (not auto-triggered by events).

**Authentication**: Required (Worker)

**Rate Limiting**: 3 attempts per worker per 24 hours

**Request Body**:
```json
{
  "trigger_type": "heavy_rain",
  "trigger_severity": "moderate",
  "zone": "zone_mumbai_central",
  "description": "Heavy rainfall prevented me from working during my shift"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "claim_id": "claim_abc123",
  "status": "pending_fraud_check",
  "message": "Claim initiated successfully. It will be processed automatically.",
  "policy_id": "policy_xyz789",
  "claims_remaining": 4
}
```

**Error Responses**:

```json
// 401 Unauthorized
{
  "error": "Unauthorized",
  "code": "AUTH_REQUIRED",
  "message": "Missing or invalid authorization header"
}

// 400 No Active Policy
{
  "error": "No Active Policy",
  "code": "NO_ACTIVE_POLICY",
  "message": "You do not have an active policy for the current week"
}

// 400 Max Claims Exceeded
{
  "error": "Max Claims Exceeded",
  "code": "MAX_CLAIMS_EXCEEDED",
  "message": "You have reached the maximum of 5 claims for this week"
}

// 429 Rate Limit Exceeded
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Maximum 3 manual claim attempts per 24 hours",
  "retry_after": 43200
}
```

**Validations**:
- Worker must have active policy for current week
- Worker must not exceed max claims per week (default: 5)
- Rate limit: 3 manual claims per 24 hours
- All required fields must be provided
- Severity must be one of: moderate, high, severe

**Process**:
1. Authenticates worker
2. Checks rate limit
3. Validates inputs
4. Checks for active policy
5. Checks max claims per week
6. Creates claim document with status "pending_fraud_check"
7. Claims orchestrator picks it up automatically
8. Returns claim ID to client

---

### 2. GET /api/claims/[claimId]

Retrieves full claim details with authorization checks.

**Authentication**: Required (Worker or Admin)

**Authorization**:
- Workers can only view their own claims
- Admins can view any claim

**Response (200 OK)**:

**Worker View** (limited fields):
```json
{
  "id": "claim_abc123",
  "workerId": "worker_456",
  "workerName": "John Doe",
  "policyId": "policy_xyz789",
  "triggerType": "heavy_rain",
  "triggerSeverity": "moderate",
  "zone": "zone_mumbai_central",
  "city": "Mumbai",
  "description": "Heavy rainfall prevented me from working",
  "status": "paid",
  "confidenceScore": 0.85,
  "payoutAmount": 250,
  "payoutId": "payout_def456",
  "resolvedAt": "2026-04-04T20:00:00Z",
  "decisionTrack": "track_a",
  "holdReason": null,
  "appealSubmitted": false,
  "appealText": null,
  "appealedAt": null,
  "manuallyInitiated": true,
  "createdAt": "2026-04-04T19:00:00Z",
  "updatedAt": "2026-04-04T20:00:00Z",
  "payout": {
    "id": "payout_def456",
    "amount_inr": 250,
    "status": "paid",
    "upi_id": "worker@paytm",
    "initiated_at": "2026-04-04T19:30:00Z",
    "paid_at": "2026-04-04T20:00:00Z",
    "failure_reason": null,
    "notes": null
  }
}
```

**Admin View** (includes fraud details):
```json
{
  // ... all worker fields above, plus:
  "fraud_result": {
    "fraudScore": 0.15,
    "fraudRiskLevel": "low",
    "fraudSignalIds": [],
    "topContributingFeatures": [
      {
        "feature": "trigger_confirmed",
        "coefficient": 0.3,
        "reason": "Trigger event verified from external source"
      }
    ]
  },
  "payout": {
    // ... all worker payout fields, plus:
    "razorpay_payout_id": "pout_abc123",
    "razorpay_fund_account_id": "fa_xyz789",
    "razorpay_reference_id": "claim_abc123_1234567890"
  }
}
```

**Error Responses**:

```json
// 401 Unauthorized
{
  "error": "Unauthorized",
  "code": "INVALID_TOKEN",
  "message": "Invalid or expired token"
}

// 403 Forbidden
{
  "error": "Forbidden",
  "code": "ACCESS_DENIED",
  "message": "You do not have permission to view this claim"
}

// 404 Not Found
{
  "error": "Not Found",
  "code": "CLAIM_NOT_FOUND",
  "message": "Claim not found"
}
```

**Security**:
- Workers cannot see fraud scores or internal model details
- Workers cannot see Razorpay internal IDs
- Admins see all fields for debugging and monitoring

---

### 3. PATCH /api/claims/[claimId]/review

Allows admins to approve or reject claims in soft review (Track B).

**Authentication**: Required (Admin only)

**Authorization**: Admin role required

**Request Body**:
```json
{
  "decision": "approve",
  "admin_note": "Verified with external weather data. Claim is legitimate."
}
```

**Response (200 OK)**:

**Approve**:
```json
{
  "success": true,
  "claim_id": "claim_abc123",
  "status": "approved",
  "message": "Claim approved successfully. Payout has been initiated.",
  "reviewed_by": "admin_789",
  "reviewed_at": "2026-04-04T20:00:00Z"
}
```

**Reject**:
```json
{
  "success": true,
  "claim_id": "claim_abc123",
  "status": "rejected",
  "message": "Claim rejected. Worker has been notified.",
  "reviewed_by": "admin_789",
  "reviewed_at": "2026-04-04T20:00:00Z"
}
```

**Error Responses**:

```json
// 403 Forbidden (Non-admin)
{
  "error": "Forbidden",
  "code": "ADMIN_ONLY",
  "message": "Only administrators can review claims"
}

// 400 Invalid Status
{
  "error": "Bad Request",
  "code": "INVALID_STATUS",
  "message": "Claim cannot be reviewed in current status: paid"
}

// 400 Invalid Decision
{
  "error": "Bad Request",
  "code": "INVALID_DECISION",
  "message": "Decision must be either \"approve\" or \"reject\""
}
```

**Validations**:
- User must be admin
- Claim must be in reviewable state: under_review, held, or under_appeal
- Decision must be "approve" or "reject"
- Admin note is required

**Process**:

**On Approve**:
1. Updates claim status to "approved"
2. Calculates payout amount if not set
3. Initiates payout via Razorpay
4. Logs state transition
5. Sends notification to worker

**On Reject**:
1. Updates claim status to "rejected"
2. Sets hold reason to admin note
3. Logs state transition
4. Sends notification to worker with reason

---

### 4. POST /api/claims/[claimId]/appeal

Allows workers to appeal held or rejected claims (Track C).

**Authentication**: Required (Worker)

**Authorization**: Worker can only appeal their own claims

**Request Body**:
```json
{
  "reason": "I was actually in the affected zone during the trigger event",
  "additional_context": "I have GPS logs and photos showing I was at the location. The system may have flagged my location incorrectly."
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "claim_id": "claim_abc123",
  "status": "under_appeal",
  "message": "Your appeal has been submitted successfully. An administrator will review it shortly.",
  "appealed_at": "2026-04-04T20:00:00Z"
}
```

**Error Responses**:

```json
// 403 Forbidden (Wrong worker)
{
  "error": "Forbidden",
  "code": "ACCESS_DENIED",
  "message": "You can only appeal your own claims"
}

// 400 Not Appealable
{
  "error": "Bad Request",
  "code": "NOT_APPEALABLE",
  "message": "Claims with status \"paid\" cannot be appealed"
}

// 400 Already Appealed
{
  "error": "Bad Request",
  "code": "ALREADY_APPEALED",
  "message": "This claim has already been appealed"
}

// 400 Reason Too Short
{
  "error": "Bad Request",
  "code": "REASON_TOO_SHORT",
  "message": "Appeal reason must be at least 10 characters"
}
```

**Validations**:
- Worker can only appeal their own claims
- Claim must be in appealable state: held or rejected
- Claim must not have been appealed already
- Reason must be at least 10 characters
- Additional context is required

**Process**:
1. Authenticates worker
2. Validates inputs
3. Checks authorization
4. Verifies claim is appealable
5. Updates claim with appeal details
6. Sets status to "under_appeal"
7. Creates notification for admin
8. Logs state transition
9. Sends notification to admin

---

## Error Response Format

All endpoints return consistent error shapes:

```json
{
  "error": "Error Type",
  "code": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

**Common Error Codes**:
- `AUTH_REQUIRED`: Missing authorization header
- `INVALID_TOKEN`: Invalid or expired Firebase token
- `ACCESS_DENIED`: User doesn't have permission
- `ADMIN_ONLY`: Admin role required
- `CLAIM_NOT_FOUND`: Claim doesn't exist
- `MISSING_FIELDS`: Required fields missing
- `INVALID_STATUS`: Claim in wrong status for operation
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

---

## Claim Status Flow

```
pending_fraud_check  ←─ Manual initiation
        ↓
   (Orchestrator processes)
        ↓
    ┌───┴───┐
    │       │
Track A   Track B/C
    │       │
auto_   under_review
approved    held
    │       │
    │   ┌───┴───┐
    │   │       │
    │ approve reject
    │   │       │
    └───┴───┐   │
            │   │
        approved│
            │   │
    payout_ │   │
    initiated   │
            │   │
         paid rejected
                │
            under_appeal
                │
            (admin reviews)
```

---

## State Transitions

All state transitions are logged in the `claimLogs` collection:

```typescript
{
  claimId: string;
  workerId: string;
  adminId?: string;
  action: string;
  status: string;
  details: string;
  timestamp: Timestamp;
}
```

**Logged Actions**:
- `claim_initiated`: Manual claim created
- `claim_approved`: Admin approved claim
- `claim_rejected`: Admin rejected claim
- `appeal_submitted`: Worker submitted appeal

---

## Rate Limiting

### Manual Claim Initiation
- **Limit**: 3 attempts per worker per 24 hours
- **Implementation**: In-memory store (upgrade to Upstash Redis for production)
- **Response**: 429 with `retry_after` field (seconds)

**Production Upgrade**:
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

const key = `claim_initiate:${workerId}`;
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, 86400); // 24 hours
}
if (count > 3) {
  return 429; // Rate limit exceeded
}
```

---

## Security Features

### Authentication
- All endpoints require Firebase ID token
- Token verified before processing
- User ID extracted from token

### Authorization
- Workers can only access their own claims
- Admins can access all claims
- Admin role verified for review endpoint

### Data Protection
- Workers cannot see fraud scores
- Workers cannot see internal model details
- Workers cannot see Razorpay internal IDs
- Sensitive data only exposed to admins

### Logging
- All state transitions logged
- Admin actions logged with admin ID
- Timestamps recorded for audit trail

---

## Integration Examples

### Example 1: Worker Initiates Claim

```typescript
import { getAuth } from 'firebase/auth';

async function initiateManualClaim() {
  const auth = getAuth();
  const user = auth.currentUser;
  const token = await user.getIdToken();
  
  const response = await fetch('/api/claims/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trigger_type: 'heavy_rain',
      trigger_severity: 'moderate',
      zone: 'zone_mumbai_central',
      description: 'Heavy rainfall prevented me from working'
    })
  });
  
  const result = await response.json();
  console.log('Claim ID:', result.claim_id);
}
```

### Example 2: Worker Views Claim

```typescript
async function viewClaim(claimId: string) {
  const auth = getAuth();
  const user = auth.currentUser;
  const token = await user.getIdToken();
  
  const response = await fetch(`/api/claims/${claimId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const claim = await response.json();
  console.log('Status:', claim.status);
  console.log('Payout:', claim.payoutAmount);
}
```

### Example 3: Admin Reviews Claim

```typescript
async function reviewClaim(claimId: string, approve: boolean) {
  const auth = getAuth();
  const user = auth.currentUser;
  const token = await user.getIdToken();
  
  const response = await fetch(`/api/claims/${claimId}/review`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      decision: approve ? 'approve' : 'reject',
      admin_note: approve 
        ? 'Verified with external data. Legitimate claim.'
        : 'Insufficient evidence. Location mismatch.'
    })
  });
  
  const result = await response.json();
  console.log('Review result:', result.message);
}
```

### Example 4: Worker Appeals Claim

```typescript
async function appealClaim(claimId: string) {
  const auth = getAuth();
  const user = auth.currentUser;
  const token = await user.getIdToken();
  
  const response = await fetch(`/api/claims/${claimId}/appeal`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: 'I was in the affected zone during the event',
      additional_context: 'I have GPS logs and photos as evidence'
    })
  });
  
  const result = await response.json();
  console.log('Appeal submitted:', result.message);
}
```

---

## Testing

### Test Manual Claim Initiation

```bash
curl -X POST http://localhost:3000/api/claims/initiate \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_type": "heavy_rain",
    "trigger_severity": "moderate",
    "zone": "zone_mumbai_central",
    "description": "Heavy rainfall prevented me from working"
  }'
```

### Test Claim Retrieval

```bash
curl -X GET http://localhost:3000/api/claims/claim_abc123 \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

### Test Claim Review (Admin)

```bash
curl -X PATCH http://localhost:3000/api/claims/claim_abc123/review \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "admin_note": "Verified with external data"
  }'
```

### Test Claim Appeal

```bash
curl -X POST http://localhost:3000/api/claims/claim_abc123/appeal \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "I was in the affected zone",
    "additional_context": "I have GPS logs as evidence"
  }'
```

---

## Production Checklist

- [ ] Firebase authentication configured
- [ ] Admin role claims configured in Firebase
- [ ] Rate limiting upgraded to Upstash Redis
- [ ] Notification service integrated
- [ ] Email notifications configured
- [ ] Push notifications configured
- [ ] Monitoring and alerting set up
- [ ] Error tracking configured (Sentry)
- [ ] Load testing completed
- [ ] Security audit completed

---

## Monitoring

### Key Metrics to Track

- Manual claim initiation rate
- Claim approval rate
- Claim rejection rate
- Appeal submission rate
- Average review time
- Rate limit hit rate
- Error rate by endpoint

### Logs to Monitor

```
[Claim Initiate] Request from worker: worker_456
[Claim Initiate] Active policy found: policy_xyz789
[Claim Initiate] Claims this week: 2 / 5
[Claim Initiate] Claim created: claim_abc123
[Claim Review] Admin user: admin_789
[Claim Review] Decision: approve
[Claim Review] Claim approved
[Claim Review] Payout initiated
[Claim Appeal] User: worker_456
[Claim Appeal] Current status: held
[Claim Appeal] Appeal submitted
[Claim Appeal] Admin notification created
```

---

## Support

For issues or questions:
- Check error codes in response
- Review logs for detailed error messages
- Verify Firebase token is valid
- Verify user has required permissions
- Check rate limits haven't been exceeded
