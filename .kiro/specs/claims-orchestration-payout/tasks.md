# Implementation Plan: Claims Orchestration and Payout

## Overview

This implementation plan breaks down the Claims Orchestration and Payout system into discrete coding tasks. The system implements a complete automated claims lifecycle from trigger detection through AI-powered fraud analysis to simulated payout execution via Razorpay test mode. Implementation follows a bottom-up approach: foundational utilities first, then core orchestration logic, then integration points.

## Tasks

- [x] 1. Set up Firebase Cloud Functions project structure
  - Initialize functions directory with TypeScript configuration
  - Configure firebase.json with functions, firestore, and hosting settings
  - Set up package.json with required dependencies (firebase-admin, firebase-functions, node-fetch)
  - Create tsconfig.json for TypeScript compilation
  - Create directory structure: src/triggers, src/orchestration, src/payout, src/notifications, src/utils, src/types
  - _Requirements: 1.1, 2.1_

- [x] 2. Define TypeScript type definitions
  - [x] 2.1 Create type definitions for claims (src/types/claim.ts)
    - Define Claim interface with all fields (id, workerId, policyId, triggerEventId, status, confidenceScore, etc.)
    - Define ClaimStatus, TriggerType, TriggerSeverity enums
    - Define ClaimContext interface for orchestration
    - _Requirements: 2.3, 2.4, 2.5_
  
  - [x] 2.2 Create type definitions for payouts (src/types/payout.ts)
    - Define Payout interface with Razorpay fields
    - Define PayoutStatus enum
    - Define RazorpayPayoutRequest and RazorpayPayoutResponse interfaces
    - _Requirements: 6.4, 9.2_
  
  - [x] 2.3 Create type definitions for triggers (src/types/trigger.ts)
    - Define TriggerEvent interface with audit trail fields
    - Define TriggerThreshold interface for monitoring logic
    - Define ExternalFeedData interface
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  
  - [x] 2.4 Create type definitions for fraud signals (src/types/fraud.ts)
    - Define FraudSignalVector interface with 20 features
    - Define FraudDetectionResponse interface
    - Define ConfidenceScoreResponse interface
    - Define FraudSignal interface for Firestore documents
    - _Requirements: 4.1, 4.3, 5.1, 5.3_

- [x] 3. Implement utility functions
  - [x] 3.1 Create Firestore helper functions (src/utils/firestore.ts)
    - Implement getDocument, updateDocument, createDocument helpers with error handling
    - Implement queryCollection helper with pagination support
    - Implement transaction helpers for atomic updates
    - _Requirements: 17.4, 17.9_
  
  - [x] 3.2 Create structured logger (src/utils/logger.ts)
    - Implement LogEntry interface with timestamp, level, service, operation fields
    - Implement logger functions: debug, info, warn, error with structured JSON output
    - Add context enrichment (claimId, workerId, payoutId)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.9_
  
  - [x] 3.3 Create input validators (src/utils/validators.ts)
    - Implement validateClaim, validatePayout, validateTriggerEvent functions
    - Implement UPI ID format validation
    - Implement zone and city validation against allowed values
    - _Requirements: 2.4, 6.4_

- [x] 4. Implement external feed integrations
  - [x] 4.1 Create external feed client (src/triggers/externalFeeds.ts)
    - Implement fetchWeatherData function (rainfall API integration)
    - Implement fetchAQIData function (air quality API integration)
    - Implement fetchHeatIndexData function (heat stress API integration)
    - Implement fetchZoneClosureData function (zone closure feed integration)
    - Implement fetchPlatformOpsData function (platform operations feed integration)
    - Add error handling and timeout logic (5 second timeout per feed)
    - _Requirements: 1.2_

- [x] 5. Implement Trigger Monitoring Engine
  - [x] 5.1 Create trigger threshold logic (src/triggers/triggerMonitoring.ts)
    - Implement TRIGGER_THRESHOLDS array with 5 trigger types
    - Implement evaluateTriggerThresholds function to check all thresholds
    - Implement calculateTriggerSeverity function (moderate/high/severe)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_
  
  - [x] 5.2 Implement trigger event creation
    - Implement createTriggerEvent function to write TriggerEvent documents
    - Calculate affectedWorkersCount by querying active policies in trigger zone
    - Write complete audit data (sourceFeed, rawMeasurementValue, thresholdApplied)
    - _Requirements: 1.8, 1.9, 14.4_
  
  - [x] 5.3 Create scheduled Cloud Function
    - Export monitorTriggers function with pubsub.schedule('every 15 minutes')
    - Poll all 5 external feeds in parallel
    - Evaluate thresholds and create TriggerEvent documents
    - Log all trigger detections with structured logging
    - _Requirements: 1.1, 1.10, 18.8_

- [x] 6. Implement Claims Orchestrator - Step 1: Load Claim Context
  - [x] 6.1 Create context loader (src/orchestration/contextLoader.ts)
    - Implement loadClaimContext function that fetches claim, triggerEvent, worker, policy documents
    - Handle missing documents with error status updates
    - Return ClaimContext object or null on error
    - _Requirements: 2.1, 2.2_

- [x] 7. Implement Claims Orchestrator - Step 2: Build Signal Vector
  - [x] 7.1 Create signal builder (src/orchestration/signalBuilder.ts)
    - Implement buildSignalVector function with 20-feature FraudSignalVector
    - Compute claim_frequency_7d by querying claims collection
    - Compute days_since_registration from worker.joinedDate
    - Compute zone_overlap by comparing trigger zone with worker zone
    - Use safe defaults for unavailable device signals (motion_variance: 5.0, network_type: '1', rtt_ms: 200, etc.)
    - _Requirements: 4.1, 4.3_

- [x] 8. Implement Claims Orchestrator - Step 3: Call Fraud Detection
  - [x] 8.1 Create fraud detection client (src/orchestration/fraudDetection.ts)
    - Implement callFraudDetection function that POSTs to ML_Service /fraud/score endpoint
    - Set 5 second timeout using AbortSignal.timeout(5000)
    - Parse FraudDetectionResponse with anomaly_score, risk_level, top_contributing_features
    - _Requirements: 4.2, 18.2_
  
  - [x] 8.2 Implement fraud detection fallback logic
    - Catch ML service errors and log warning
    - Implement hardcoded fallback rules: emulator_flag → 1.0, claim_frequency_7d > 3 → 1.0, speed > 80 km/h → 1.0
    - Return FraudDetectionResponse with model_used: 'fallback_rules'
    - _Requirements: 4.6, 17.1_
  
  - [x] 8.3 Create FraudSignal documents
    - When anomaly_score ≥ 0.7, create FraudSignal document with severity 'high' or 'critical'
    - When anomaly_score 0.3-0.7, create FraudSignal document with severity 'medium'
    - Store plain-language explanations and contributing features
    - _Requirements: 4.4, 4.5, 4.9_
  
  - [x] 8.4 Implement duplicate and fraud ring checks
    - Check for duplicate claims (same workerId + triggerEventId)
    - Check for coordinated fraud rings (>50 claims in same zone within 3 minutes)
    - _Requirements: 4.7, 4.8_

- [x] 9. Implement Claims Orchestrator - Step 4: Call Confidence Scorer
  - [x] 9.1 Create confidence scoring client (src/orchestration/confidenceScoring.ts)
    - Implement callConfidenceScorer function that POSTs to ML_Service /confidence/score endpoint
    - Build 9-feature confidence vector (trigger_confirmed, zone_overlap_score, emulator_flag, speed_plausible, etc.)
    - Set 5 second timeout
    - Parse ConfidenceScoreResponse with confidence_score, decision_track, top_contributing_features
    - _Requirements: 5.1, 5.2, 5.3, 18.3_
  
  - [x] 9.2 Implement confidence scoring fallback logic
    - Catch ML service errors and log warning
    - Implement weighted binary fallback: 5 checks × 0.2 each (trigger_confirmed, zone_overlap, no_emulator, speed_plausible, no_duplicate)
    - Calculate decision_track based on score thresholds (≥0.75 → auto_approve, 0.40-0.75 → soft_review, <0.40 → hold)
    - _Requirements: 5.8, 17.1_

- [x] 10. Implement Claims Orchestrator - Step 5: Route the Claim
  - [x] 10.1 Create claim router (src/orchestration/claimRouter.ts)
    - Implement routeClaim function with Track A/B/C routing logic
    - Track A (confidence ≥ 0.75): Update status to 'auto_approved', set resolvedAt timestamp
    - Track B (0.40-0.75): Update status to 'under_review', schedule re-evaluation after 2 hours
    - Track C (<0.40): Update status to 'held', generate plain-language holdReason
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 6.1, 7.1, 8.1_
  
  - [x] 10.2 Implement plain-language reason generator
    - Implement generatePlainLanguageReason function that checks fallback_checks
    - Generate human-readable explanations for each failure type
    - _Requirements: 8.2, 8.9_
  
  - [x] 10.3 Implement Track B re-evaluation scheduling
    - Create scheduleClaimReEvaluation function using Cloud Tasks or Firestore TTL
    - Re-run confidence scoring after 2 hours with updated data
    - Auto-promote to Track A if confidence reaches ≥ 0.75
    - _Requirements: 7.4, 7.5, 7.6, 7.7_

- [x] 11. Implement Claims Orchestrator - Step 6: Compute Payout Amount
  - [x] 11.1 Create payout calculator (src/orchestration/payoutCalculator.ts)
    - Implement PAYOUT_SLAB_TABLE with 5 entries (severity × exposure duration)
    - Implement computePayoutAmount function that calculates exposure hours
    - Find matching slab based on severity and exposure duration
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [x] 11.2 Implement payout adjustments
    - Adjust payout by 50% if trigger occurred outside worker's shift hours
    - Implement getShiftStartHour helper function
    - _Requirements: 3.9_
  
  - [x] 11.3 Implement weekly coverage cap enforcement
    - Query WeeklyCoverage document for policy
    - Calculate remainingProtection = maxProtection - totalPaidOut
    - Cap payout at remainingProtection
    - Reject claim if totalPaidOut already equals maxProtection
    - _Requirements: 3.7, 3.8, 16.3, 16.4, 16.5_

- [x] 12. Implement Claims Orchestrator - Step 7: Initiate Payout
  - [x] 12.1 Create payout initiator (src/orchestration/payoutInitiator.ts)
    - Implement initiatePayout function that creates Payout document
    - Set initial status to 'pending', method to 'upi'
    - Update claim document with payoutId
    - Update claim status to 'payout_initiated'
    - Invoke payout service
    - _Requirements: 6.3, 6.4, 6.7_

- [x] 13. Wire Claims Orchestrator steps together
  - [x] 13.1 Create main orchestrator function (src/orchestration/claimsOrchestrator.ts)
    - Export onClaimCreated function with firestore.document('claims/{claimId}').onCreate trigger
    - Execute 7 steps sequentially: loadContext → buildSignal → fraudDetection → confidenceScoring → routeClaim → computePayout → initiatePayout
    - Handle errors at each step with structured logging
    - Update claim status to 'error' on unrecoverable failures
    - _Requirements: 2.1, 2.8, 5.10, 18.1_
  
  - [x] 13.2 Implement automatic claim creation from trigger events
    - Export onTriggerEventCreated function with firestore.document('triggerEvents/{eventId}').onCreate trigger
    - Query active policies in trigger zone
    - Create Claim document for each eligible worker
    - Populate claim with workerId, policyId, triggerEventId, triggerType, triggerSeverity, zone, description
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.9_

- [x] 14. Implement Payout Service
  - [x] 14.1 Create Razorpay client (src/payout/payoutService.ts)
    - Implement invokePayoutService function that fetches Payout and Worker documents
    - Build Razorpay API request with account_number, fund_account_id, amount (in paise), currency, mode, purpose, reference_id
    - Set Authorization header with Basic auth (base64 encoded key_id:key_secret)
    - POST to https://api.razorpay.com/v1/payouts
    - _Requirements: 6.5, 9.1, 9.2_
  
  - [x] 14.2 Handle Razorpay API responses
    - On success: Update Payout document with razorpayPayoutId and status 'processing'
    - On error: Update Payout status to 'failed', set failureReason, schedule retry
    - _Requirements: 6.6, 9.3, 9.8_
  
  - [x] 14.3 Implement payout retry logic (src/payout/payoutRetry.ts)
    - Implement schedulePayoutRetry function with exponential backoff (2min, 4min, 8min)
    - Create payoutRetries collection document with attemptNumber and scheduledAt
    - Max 3 retry attempts
    - _Requirements: 9.9, 17.2_
  
  - [x] 14.4 Update WeeklyCoverage on payout completion
    - Increment totalPaidOut field by payout amount
    - Update status to 'claimed'
    - Append claimId to claimIds array
    - _Requirements: 6.8, 16.2, 16.6, 16.7_

- [x] 15. Implement Razorpay Webhook Handler
  - [x] 15.1 Create Vercel API route (src/app/api/webhooks/razorpay/route.ts)
    - Export POST handler function
    - Verify webhook signature using x-razorpay-signature header and HMAC SHA256
    - Return 401 if signature verification fails
    - _Requirements: 9.4, 9.7, 17.6_
  
  - [x] 15.2 Handle payout.processed event
    - Find Payout document by razorpayPayoutId
    - Update Payout status to 'completed', set paidAt timestamp
    - Update Claim status to 'paid'
    - Update WeeklyCoverage totalPaidOut
    - Send success notification to worker
    - _Requirements: 9.5, 16.2_
  
  - [x] 15.3 Handle payout.failed and payout.reversed events
    - Find Payout document by razorpayPayoutId
    - Update Payout status to 'failed', set failureReason
    - Send failure notification to worker
    - _Requirements: 9.6_
  
  - [x] 15.4 Add webhook logging
    - Log all webhook events with event type, payout ID, signature verification result
    - _Requirements: 9.10, 18.7_

- [x] 16. Implement Firebase Cloud Messaging notifications
  - [x] 16.1 Create FCM service (src/notifications/fcmService.ts)
    - Implement sendPushNotification function with workerId, title, body, action, metadata
    - Fetch worker FCM token from Firestore
    - Build FCM message payload with notification and data fields
    - Send via admin.messaging().send()
    - Handle errors gracefully (non-blocking)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 17.5_
  
  - [x] 16.2 Add deep link support
    - Include deep link URLs in notification data payload
    - Format: rozirakshak://claim/{claimId}
    - _Requirements: 15.9_
  
  - [x] 16.3 Respect notification preferences
    - Check worker.notificationPreferences before sending
    - Skip notification if disabled
    - _Requirements: 15.10_

- [x] 17. Set up environment configuration
  - [x] 17.1 Create .env.example file in functions directory
    - Add Firebase configuration variables (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY)
    - Add Razorpay test mode credentials (KEY_ID, KEY_SECRET, ACCOUNT_NUMBER, WEBHOOK_SECRET)
    - Add ML microservice URL (RENDER_ML_URL)
    - Add FCM server key
    - Add Cloud Functions configuration (REGION, MEMORY, TIMEOUT)
    - _Requirements: 9.1_
  
  - [x] 17.2 Configure Firebase environment variables
    - Run firebase functions:config:set for all environment variables
    - Document configuration in README
    - _Requirements: 9.1_

- [x] 18. Checkpoint - Ensure all Cloud Functions compile and deploy
  - Run `npm run build` in functions directory to verify TypeScript compilation
  - Run `firebase deploy --only functions` to deploy all functions
  - Verify all functions appear in Firebase Console
  - Check Cloud Functions logs for any startup errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Create worker claims dashboard UI
  - [x] 19.1 Update worker claims page (src/app/worker/claims/page.tsx)
    - Query claims collection filtered by workerId, ordered by createdAt descending
    - Use Firestore onSnapshot for real-time updates
    - Display claim cards with trigger type icon, zone, date, status badge, confidence score, payout amount
    - _Requirements: 10.1, 10.2, 10.8_
  
  - [x] 19.2 Add status badge styling
    - Green badges for 'auto_approved' and 'approved'
    - Yellow badges for 'under_review'
    - Red badges for 'held'
    - Gray badges for 'denied'
    - _Requirements: 10.3_
  
  - [x] 19.3 Add confidence score progress bar
    - Green for ≥ 75%
    - Yellow for 40-75%
    - Red for < 40%
    - _Requirements: 10.4_
  
  - [x] 19.4 Add claim details modal
    - Show hold reason for held claims
    - Add appeal submission form
    - _Requirements: 10.5, 10.6, 8.3_
  
  - [x] 19.5 Add summary card
    - Display total claims count
    - Display total amount received (sum of completed payouts)
    - _Requirements: 10.7_
  
  - [x] 19.6 Add weekly coverage display
    - Show premium paid, max protection, total paid out, remaining protection
    - Display progress bar for totalPaidOut / maxProtection
    - _Requirements: 16.8, 16.9_

- [ ] 20. Create admin claims review dashboard
  - [ ] 20.1 Update admin claims page (src/app/admin/claims/page.tsx)
    - Query claims collection with pagination (20 per page)
    - Add filter controls for status, trigger type, date range, confidence score range
    - Add search input for worker name or claim ID
    - _Requirements: 11.1, 11.2, 11.3_
  
  - [ ] 20.2 Add claim action buttons
    - Approve button (green checkmark) for under_review and held claims
    - Hold button (red X) with reason modal
    - View Details button that opens modal with full claim details, fraud signals, confidence breakdown
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.8_
  
  - [ ] 20.3 Add summary statistics
    - Total claims count, claims by status, total payout volume, average confidence score
    - _Requirements: 11.9_
  
  - [ ] 20.4 Add CSV export functionality
    - Export filtered claims with all fields
    - _Requirements: 11.10_

- [ ] 21. Create admin fraud review queue
  - [ ] 21.1 Update admin fraud page (src/app/admin/fraud/page.tsx)
    - Query fraudSignals collection filtered by status 'open', ordered by severity
    - Add filter controls for severity, signal type, status
    - Display fraud signal cards with worker name, claim ID, signal type, severity badge, details
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [ ] 21.2 Add fraud signal action buttons
    - Investigate button (opens claim details modal)
    - Resolve button (marks as resolved)
    - Dismiss button (marks as false positive with reason)
    - _Requirements: 12.4, 12.5, 12.6, 12.7_
  
  - [ ] 21.3 Add fraud ring detection visualization
    - Group fraud signals by device fingerprint or UPI ID
    - Highlight coordinated fraud rings visually
    - _Requirements: 12.9_
  
  - [ ] 21.4 Add Block Worker action
    - Update worker account status to 'suspended'
    - Prevent future policy purchases
    - _Requirements: 12.10_

- [ ] 22. Create admin payout reconciliation dashboard
  - [ ] 22.1 Add Payouts tab to admin dashboard
    - Query payouts collection ordered by createdAt descending
    - Display payout table with ID, claim ID, worker name, amount, UPI ID, status, Razorpay ID, timestamps
    - _Requirements: 13.1, 13.2_
  
  - [ ] 22.2 Add payout filters and status badges
    - Filter by status, date range, amount range
    - Blue badge for 'pending', yellow for 'processing', green for 'completed', red for 'failed'
    - Display failure reason for failed payouts
    - _Requirements: 13.3, 13.4, 13.5_
  
  - [ ] 22.3 Add Retry Payout button
    - Re-invoke Payout Service for failed payouts
    - _Requirements: 13.6_
  
  - [ ] 22.4 Add payout summary and charts
    - Summary card: total payouts, total amount, success rate, average payout time
    - Chart: daily payout volume and success rate over last 30 days
    - _Requirements: 13.7, 13.9_
  
  - [ ] 22.5 Add CSV export for reconciliation
    - Export payouts with all fields including Razorpay transaction IDs
    - _Requirements: 13.8_

- [ ] 23. Create admin trigger events audit trail
  - [ ] 23.1 Update admin triggers page (src/app/admin/triggers/page.tsx)
    - Query triggerEvents collection ordered by startTime descending
    - Display trigger cards with type, severity, zone, city, start/end time, affected workers count
    - _Requirements: 14.1, 14.2_
  
  - [ ] 23.2 Add trigger filters
    - Filter by trigger type, severity, city, zone, date range
    - _Requirements: 14.3_
  
  - [ ] 23.3 Add trigger details modal
    - Show full trigger details, audit fields (sourceFeed, rawMeasurementValue, thresholdApplied)
    - List affected workers and created claims
    - Display source feed raw payload
    - _Requirements: 14.4, 14.5_
  
  - [ ] 23.4 Add Manual Override action
    - Allow admin to manually create trigger event for testing
    - _Requirements: 14.7_
  
  - [ ] 23.5 Add trigger summary and charts
    - Summary: total triggers this week, triggers by type, average affected workers
    - Timeline chart: trigger frequency by type over last 90 days
    - _Requirements: 14.8, 14.10_
  
  - [ ] 23.6 Add CSV export for compliance
    - Export trigger events with all audit fields
    - _Requirements: 14.9_

- [ ] 24. Implement error handling and monitoring
  - [x] 24.1 Add idempotency checks
    - Check for duplicate claim creation (same workerId + triggerEventId)
    - Check for duplicate payout execution (same claimId)
    - Check for duplicate webhook processing (same razorpayPayoutId + event type)
    - _Requirements: 17.9_
  
  - [ ] 24.2 Add automatic escalation
    - Escalate claims stuck in 'under_review' for >24 hours to admin queue
    - Query Razorpay API for payouts stuck in 'processing' for >1 hour
    - _Requirements: 17.7, 17.8_
  
  - [ ] 24.3 Add performance monitoring
    - Log Cloud Function execution times
    - Alert if any function exceeds 30 seconds
    - _Requirements: 17.10_

- [ ] 25. Final checkpoint - End-to-end testing
  - Create test trigger event in Firestore and verify claim auto-creation
  - Verify fraud detection and confidence scoring execute correctly
  - Verify Track A claims trigger immediate payout
  - Verify Track B claims enter 2-hour review window
  - Verify Track C claims display hold reasons
  - Test Razorpay webhook handler with test events
  - Verify push notifications sent at each lifecycle stage
  - Verify worker dashboard displays claims correctly
  - Verify admin dashboards show all data with filtering
  - Verify weekly coverage cap enforcement
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All Cloud Functions use TypeScript with Firebase Admin SDK
- ML service calls have 5-second timeouts with fallback logic
- All critical operations are idempotent to prevent duplicates
- Structured logging is used throughout for observability
- Razorpay integration uses test mode credentials
- Push notifications are non-blocking (errors don't stop claim processing)
- Weekly coverage caps are enforced before payout initiation
- Admin dashboards include CSV export for compliance and reconciliation
