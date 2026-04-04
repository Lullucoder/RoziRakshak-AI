# 🚀 Quick Deploy to Vercel

## Prerequisites
- Vercel account (free tier works)
- Firebase project
- Razorpay test account (optional)

## Step 1: Firebase Setup (5 minutes)

1. Go to https://console.firebase.google.com
2. Create a new project
3. Enable **Authentication** > **Phone** provider
4. Enable **Firestore Database** (start in test mode)
5. Go to **Project Settings** > **Service Accounts**
6. Click **Generate New Private Key** and save the JSON file

## Step 2: Get Firebase Credentials

### Client SDK (Public)
From Firebase Console > Project Settings > General:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### Admin SDK (Secret)
From the service account JSON file you downloaded:
```
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
```

**Important**: For the private key, replace actual newlines with `\n` (literal backslash-n).

## Step 3: Deploy to Vercel (2 minutes)

### Option A: Via Vercel Dashboard (Easiest)

1. Go to https://vercel.com/new
2. Import your Git repository
3. Click **Deploy** (it will fail, that's OK)
4. Go to **Settings** > **Environment Variables**
5. Add all the Firebase variables from Step 2
6. Add these optional variables:
   ```
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   RENDER_ML_URL=https://your-ml-service.onrender.com (optional)
   ```
7. Go to **Deployments** and click **Redeploy**

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Add environment variables
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# ... add all other variables

# Deploy to production
vercel --prod
```

## Step 4: Configure Firestore (2 minutes)

1. Go to Firebase Console > Firestore Database
2. Click **Rules** tab
3. Copy the contents of `firestore.rules` from this repo
4. Paste and **Publish**
5. Click **Indexes** tab
6. Copy the contents of `firestore.indexes.json`
7. Create indexes as needed (Firebase will prompt you when needed)

## Step 5: Test Your Deployment (5 minutes)

1. Open your Vercel URL
2. Click **Login**
3. Enter a phone number (use your real number for testing)
4. Enter OTP from SMS
5. Complete onboarding form
6. Check that dashboard loads

## Optional: Razorpay Setup

If you want to test payouts:

1. Create account at https://razorpay.com
2. Switch to **Test Mode**
3. Go to **Settings** > **API Keys**
4. Copy your test keys
5. Add to Vercel environment variables:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
   RAZORPAY_ACCOUNT_NUMBER=2323230000000000
   RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```
6. Configure webhook URL in Razorpay:
   - URL: `https://your-app.vercel.app/api/webhooks/razorpay`
   - Events: Select all payout events

## Troubleshooting

### Build fails with "Service account object must contain..."
**Solution**: Make sure all three Firebase Admin variables are set correctly in Vercel.

### "Invalid or expired token" error
**Solution**: Check that Firebase client SDK variables match your Firebase project.

### Phone OTP not working
**Solution**: 
1. Check Firebase Authentication is enabled
2. Check Phone provider is enabled
3. For testing, add test phone numbers in Firebase Console

### API routes return 500 errors
**Solution**: Check Vercel Function Logs for detailed error messages.

## What's Next?

After successful deployment:

1. ✅ Test all core features
2. ✅ Monitor Vercel logs for errors
3. ✅ Set up custom domain (optional)
4. ✅ Deploy ML service for AI features (optional)
5. ✅ Add team members to Vercel project

## Need Help?

- Check `DEPLOYMENT_CHECKLIST.md` for detailed instructions
- Check `BUILD_FIXES_SUMMARY.md` for technical details
- Check `VERIFICATION_REPORT.md` for feature verification
- Check Vercel logs for error messages

---

**Estimated Total Time**: 15-20 minutes

**You're ready to go!** 🎉
