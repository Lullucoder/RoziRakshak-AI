# Firebase Authentication Test Plan

## Prerequisites

1. **Firebase Console Setup**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select project: `rozi-rakshak-ai`
   - Navigate to **Authentication → Sign-in method**
   - Ensure **Phone** provider is enabled

2. **Test Phone Numbers** (Add in Firebase Console):
   - Go to **Authentication → Sign-in method → Phone**
   - Scroll to "Phone numbers for testing"
   - Add these test numbers:
     - **Worker Test**: `+919876543210` → OTP: `123456`
     - **Admin Test**: `+919876543211` → OTP: `123456`

3. **Authorized Domains**:
   - Go to **Authentication → Settings → Authorized domains**
   - Verify `localhost` is in the list

4. **Environment Configuration**:
   - Confirm `.env` has `NEXT_PUBLIC_USE_MOCK_AUTH=false`
   - All Firebase credentials are filled in

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

---

## Test Sequence

### TEST 1 — New Worker Signup ✅

**Objective**: Verify new worker account creation and onboarding flow

**Steps**:
1. Open `http://localhost:3000` in browser
2. Click "Get Started" or "Start Protection" button
3. LoginModal opens
4. Select **"Worker"** role
5. Enter test phone: `9876543210` (without +91)
6. Click "Send OTP"
7. reCAPTCHA runs invisibly (no challenge should appear)
8. Enter OTP: `123456`
9. Click "Verify & Continue"

**Expected Results**:
- ✅ AuthContext creates Firestore document in `workers` collection with:
  - `role: "worker"`
  - `isOnboarded: false`
  - `uid: <firebase-uid>`
  - `phone: "+919876543210"`
- ✅ Redirected to `/onboarding`
- ✅ Onboarding form displays with all fields
- ✅ Fill in all fields:
  - Full Name: "Test Worker"
  - City: "Bengaluru"
  - Platform: "Zepto"
  - Working Zone: "Koramangala"
  - Shift Start Time: "9 AM"
  - Shift Duration: "8 hours"
  - Weekly Income Range: "₹7,000 - ₹10,000"
  - UPI ID: "testworker@upi"
- ✅ Click "Complete Profile"
- ✅ Firestore document updated with `isOnboarded: true` and all form data
- ✅ Toast: "Welcome to RoziRakshak!"
- ✅ Redirected to `/worker/dashboard`
- ✅ Dashboard greeting shows: "Good evening, Test Worker 👋"

**Verification**:
- Check Firestore Console → `workers` collection → document with phone `+919876543210`
- Verify all fields are saved correctly

---

### TEST 2 — New Admin Signup ✅

**Objective**: Verify admin accounts skip onboarding

**Steps**:
1. Open `http://localhost:3000` in **incognito/private window**
2. Click "Get Started"
3. Select **"Admin"** role
4. Enter test phone: `9876543211`
5. Click "Send OTP"
6. Enter OTP: `123456`
7. Click "Verify & Continue"

**Expected Results**:
- ✅ AuthContext creates Firestore document with:
  - `role: "admin"`
  - `isOnboarded: true` (admins are auto-onboarded)
- ✅ **NO onboarding page shown**
- ✅ Redirected directly to `/admin/dashboard`
- ✅ Admin dashboard displays with sidebar navigation

**Verification**:
- Check Firestore Console → `workers` collection → document with phone `+919876543211`
- Verify `role: "admin"` and `isOnboarded: true`

---

### TEST 3 — Returning Worker ✅

**Objective**: Verify returning users skip signup/onboarding

**Steps**:
1. Sign out from worker account (if logged in)
2. Open `http://localhost:3000`
3. Click "Get Started"
4. Select **any role** (should be ignored)
5. Enter worker phone: `9876543210`
6. Click "Send OTP"
7. Enter OTP: `123456`
8. Click "Verify & Continue"

**Expected Results**:
- ✅ AuthContext finds existing Firestore document
- ✅ Uses stored `role: "worker"` (ignores selected role)
- ✅ Uses stored `isOnboarded: true`
- ✅ **NO onboarding shown**
- ✅ Redirected directly to `/worker/dashboard`
- ✅ Dashboard shows saved name: "Test Worker 👋"

---

### TEST 4 — Role Lock ✅

**Objective**: Verify stored role takes precedence over selected role

**Steps**:
1. Sign out from admin account
2. Open `http://localhost:3000`
3. Click "Get Started"
4. Select **"Worker"** role (intentionally wrong)
5. Enter admin phone: `9876543211`
6. Click "Send OTP"
7. Enter OTP: `123456`
8. Click "Verify & Continue"

**Expected Results**:
- ✅ AuthContext finds existing document with `role: "admin"`
- ✅ Stored role "admin" wins, selected role "worker" is ignored
- ✅ Redirected to `/admin/dashboard` (not worker dashboard)

---

### TEST 5 — Route Protection ✅

**Objective**: Verify unauthenticated and unauthorized access is blocked

**Test 5A: Unauthenticated Access**
1. Sign out completely
2. Navigate to `http://localhost:3000/worker/dashboard`
   - ✅ Redirected to `/login`
3. Navigate to `http://localhost:3000/admin/dashboard`
   - ✅ Redirected to `/login`

**Test 5B: Unauthorized Access (Worker → Admin)**
1. Log in as worker (phone: `9876543210`)
2. Navigate to `http://localhost:3000/admin/dashboard`
   - ✅ Redirected to `/worker/dashboard`

**Test 5C: Unauthorized Access (Admin → Worker)**
1. Log in as admin (phone: `9876543211`)
2. Navigate to `http://localhost:3000/worker/dashboard`
   - ✅ Redirected to `/admin/dashboard`

---

### TEST 6 — Session Persistence ✅

**Objective**: Verify Firebase session persists across page reloads

**Steps**:
1. Log in as worker (phone: `9876543210`)
2. Navigate to `/worker/dashboard`
3. Hard refresh page (Ctrl+R or Cmd+R)

**Expected Results**:
- ✅ Still on `/worker/dashboard`
- ✅ NOT redirected to login
- ✅ User data loads correctly
- ✅ Dashboard shows correct name
- ✅ Firebase `browserLocalPersistence` handles this automatically

---

### TEST 7 — Sign Out ✅

**Objective**: Verify sign out clears session and protects routes

**Steps**:
1. Log in as worker
2. Navigate to `/worker/profile` or any worker page
3. Click sign out button (if available in UI)
   - OR manually call `signOut()` from AuthContext
4. After sign out, navigate to `/worker/dashboard`

**Expected Results**:
- ✅ Redirected to `/` (landing page)
- ✅ Navigate to `/worker/dashboard` → redirected to `/login`
- ✅ Session cleared from Firebase
- ✅ AuthContext state reset

---

### TEST 8 — Real Data in Admin ✅

**Objective**: Verify admin can see real worker data

**Steps**:
1. **Create worker account**:
   - Sign out completely
   - Log in with phone: `9876543210`
   - Complete onboarding with name: "Test Worker"
   - Sign out

2. **Log in as admin**:
   - Log in with phone: `9876543211`
   - Navigate to `/admin/users`

**Expected Results**:
- ✅ Admin users page displays
- ✅ "Test Worker" appears in the users table
- ✅ Worker data shows:
   - Name: "Test Worker"
   - Phone: "+919876543210"
   - City: "Bengaluru"
   - Platform: "Zepto"
   - Role: "worker"

**Verification**:
- Check that admin dashboard fetches real data from Firestore
- Verify worker profile is visible to admin

---

## Common Issues & Fixes

### Issue: reCAPTCHA not loading
**Fix**: 
- Check browser console for errors
- Verify Firebase API key is correct
- Ensure `localhost` is in authorized domains

### Issue: OTP not sending
**Fix**:
- Verify test phone numbers are added in Firebase Console
- Check Firebase Console → Authentication → Sign-in method → Phone is enabled
- Verify phone number format: `+919876543210`

### Issue: "Invalid OTP" error
**Fix**:
- Use test OTP: `123456` (configured in Firebase Console)
- Verify test phone number matches exactly

### Issue: Redirect loop
**Fix**:
- Check AuthContext `isOnboarded` state
- Verify Firestore document has correct `isOnboarded` value
- Check worker/admin layout guard logic

### Issue: Name not showing on dashboard
**Fix**:
- Verify onboarding form saved data to Firestore
- Check `userProfile.name` is populated in AuthContext
- Verify dashboard uses `userProfile?.name`

---

## Test Phone Numbers Summary

| Role   | Phone Number    | OTP    | Purpose                    |
|--------|-----------------|--------|----------------------------|
| Worker | +919876543210   | 123456 | New worker signup & return |
| Admin  | +919876543211   | 123456 | Admin signup & role lock   |

---

## Firestore Document Structure

### Worker Document (after onboarding):
```json
{
  "uid": "<firebase-uid>",
  "phone": "+919876543210",
  "name": "Test Worker",
  "city": "Bengaluru",
  "platform": "Zepto",
  "zone": "Koramangala",
  "shiftStartTime": "9 AM",
  "shiftDuration": "8 hours",
  "weeklyEarningRange": "₹7,000 - ₹10,000",
  "upiId": "testworker@upi",
  "role": "worker",
  "isOnboarded": true,
  "trustScore": 0.8,
  "activePlan": null,
  "claimsCount": 0,
  "joinedDate": "<timestamp>",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
```

### Admin Document:
```json
{
  "uid": "<firebase-uid>",
  "phone": "+919876543211",
  "name": "",
  "city": "",
  "platform": "",
  "zone": "",
  "workingHours": "",
  "weeklyEarningRange": "",
  "upiId": "",
  "role": "admin",
  "isOnboarded": true,
  "trustScore": 0.8,
  "activePlan": null,
  "claimsCount": 0,
  "joinedDate": "<timestamp>",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
```

---

## Success Criteria

All tests must pass with:
- ✅ No console errors
- ✅ Correct redirects
- ✅ Data persists in Firestore
- ✅ Session persists across reloads
- ✅ Role-based access control works
- ✅ Onboarding flow works for workers
- ✅ Admins skip onboarding
- ✅ Real data visible in admin dashboard

---

## Next Steps After Testing

If all tests pass:
1. Document any issues found
2. Test with real phone numbers (optional)
3. Deploy to staging environment
4. Test production Firebase configuration

If tests fail:
1. Note which test failed
2. Check browser console for errors
3. Verify Firestore data
4. Review AuthContext logic
5. Check layout guard conditions
