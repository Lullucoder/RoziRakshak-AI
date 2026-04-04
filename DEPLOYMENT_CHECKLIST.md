# RoziRakshak AI - Vercel Deployment Checklist

## ✅ Build Errors Fixed

All TypeScript and build errors have been resolved:

1. ✅ Fixed `firebase-admin` import issues (changed from modular to default import)
2. ✅ Fixed `Timestamp` type issues (separated type import from value usage)
3. ✅ Fixed duplicate `now` variable in premium-quote route
4. ✅ Fixed Next.js 16 async params in route handlers
5. ✅ Fixed React imports in example files (renamed .ts to .tsx)
6. ✅ Fixed `FieldValue` usage in payout.ts
7. ✅ Fixed `WorkerProfile` type mismatch in onboarding
8. ✅ Excluded `functions` and `ml-service` directories from TypeScript compilation

## 📋 Pre-Deployment Checklist

### 1. Environment Variables Setup

You need to configure these environment variables in Vercel:

#### Firebase Client SDK (Public)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

#### Firebase Admin SDK (Server-only, Secret)
```
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

**Important**: For `FIREBASE_ADMIN_PRIVATE_KEY`, you need to:
1. Get the private key from your Firebase service account JSON
2. Replace actual newlines with `\n` (literal backslash-n)
3. Wrap the entire key in quotes in Vercel

#### Razorpay Test Mode (Server-only, Secret)
```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
RAZORPAY_ACCOUNT_NUMBER=2323230000000000
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

#### ML Microservice
```
RENDER_ML_URL=https://your-ml-service.onrender.com
```

#### Application URL
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 2. Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication > Phone provider
3. Enable Firestore Database
4. Create a service account:
   - Go to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely
5. Set up Firestore security rules (use `firestore.rules` from repo)
6. Create Firestore indexes (use `firestore.indexes.json` from repo)

### 3. Razorpay Setup

1. Create account at https://razorpay.com
2. Switch to Test Mode
3. Get API keys from Settings > API Keys
4. Note down your test account number
5. Set up webhook secret for payout events

### 4. ML Service Deployment (Optional)

The ML service can be deployed separately on Render:
1. Deploy the `ml-service` directory to Render
2. Set the `RENDER_ML_URL` environment variable
3. Or use fallback pricing (works without ML service)

## 🚀 Deployment Steps

### Option 1: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option 2: Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository
3. Configure environment variables in Settings > Environment Variables
4. Deploy

### Option 3: Deploy via Git Integration

1. Push your code to GitHub/GitLab/Bitbucket
2. Connect repository to Vercel
3. Configure environment variables
4. Vercel will auto-deploy on every push

## 🔍 Post-Deployment Verification

### 1. Check Build Logs
- Verify no build errors
- Check that all environment variables are loaded
- Confirm TypeScript compilation succeeded

### 2. Test Core Functionality

#### Authentication
- [ ] Phone/OTP login works
- [ ] User session persists
- [ ] Logout works

#### Worker Flow
- [ ] Onboarding form submits successfully
- [ ] Dashboard loads worker data
- [ ] Can view policies
- [ ] Can view claims

#### Admin Flow
- [ ] Admin dashboard loads
- [ ] Can view all users
- [ ] Can view all claims
- [ ] Can review claims

#### API Routes
- [ ] `/api/claims/premium-quote` returns quotes
- [ ] `/api/claims/initiate` creates claims
- [ ] `/api/claims/[claimId]` returns claim details
- [ ] `/api/claims/[claimId]/review` works (admin)
- [ ] `/api/claims/[claimId]/appeal` works (worker)

### 3. Check Firebase Integration
- [ ] Firestore reads/writes work
- [ ] Authentication works
- [ ] Admin SDK functions properly

### 4. Monitor Errors
- Check Vercel Function Logs
- Check Vercel Runtime Logs
- Check browser console for client errors

## 🐛 Common Issues & Solutions

### Issue: "Service account object must contain a string 'project_id' property"
**Solution**: Ensure `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` are all set correctly in Vercel environment variables.

### Issue: "Module not found: Can't resolve 'firebase-admin'"
**Solution**: This is fixed. The build now uses the correct import pattern.

### Issue: Build fails with TypeScript errors
**Solution**: All TypeScript errors have been fixed. If you see new ones, check that you're using the latest code.

### Issue: "Invalid or expired token"
**Solution**: Check that Firebase client SDK environment variables are set correctly and match your Firebase project.

### Issue: API routes return 500 errors
**Solution**: Check Vercel Function Logs for detailed error messages. Usually related to missing environment variables.

### Issue: Razorpay webhook not working
**Solution**: 
1. Ensure `RAZORPAY_WEBHOOK_SECRET` is set
2. Configure webhook URL in Razorpay dashboard: `https://your-app.vercel.app/api/webhooks/razorpay`
3. Enable payout events in webhook settings

## 📊 Performance Optimization

### Recommended Vercel Settings
- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`
- **Node Version**: 20.x

### Caching Strategy
- Static assets are automatically cached by Vercel CDN
- API routes use Vercel's edge caching where appropriate
- Firestore queries should use indexes for performance

## 🔐 Security Checklist

- [ ] All secret environment variables are marked as "Secret" in Vercel
- [ ] Firebase Admin credentials are never exposed to client
- [ ] Firestore security rules are properly configured
- [ ] API routes have proper authentication checks
- [ ] CORS is configured if needed
- [ ] Rate limiting is implemented for sensitive endpoints

## 📝 Additional Notes

### Firebase Functions (Optional)
The `functions` directory contains Firebase Cloud Functions for background processing. These are optional and can be deployed separately:

```bash
cd functions
npm install
firebase deploy --only functions
```

### ML Service (Optional)
The ML service provides AI-powered premium calculation and fraud detection. The app works without it using fallback logic.

### PWA Features
The app is configured as a PWA but service worker registration is not yet implemented. This can be added later for offline support.

## ✅ Deployment Complete!

Once all checks pass, your RoziRakshak AI app is live and ready to use!

**Next Steps:**
1. Share the URL with your team
2. Test with real users
3. Monitor logs and errors
4. Iterate based on feedback

---

**Need Help?**
- Check Vercel documentation: https://vercel.com/docs
- Check Next.js documentation: https://nextjs.org/docs
- Check Firebase documentation: https://firebase.google.com/docs
