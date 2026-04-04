# Requirements Document

## Introduction

This document specifies the requirements for Package 4: Claims Orchestration and Payout system for RoziRakshak AI. This package implements the complete automated claims lifecycle from trigger detection through fraud analysis to payout execution. The system automatically initiates claims when parametric triggers fire, routes them through AI-powered fraud detection, and executes simulated payouts via Razorpay test mode.

## Glossary

- **Claims_Orchestrator**: Firebase Cloud Function that coordinates the complete claim lifecycle from trigger detection to payout
- **Trigger_Monitoring_Engine**: Scheduled Firebase Cloud Function that polls external data feeds and detects parametric trigger events
- **Fraud_Pipeline**: Multi-layer verification system combining ML fraud detection, confidence scoring, and rule-based checks
- **Track_A**: Auto-approval path for claims with confidence score ≥ 0.75
- **Track_B**: Soft review path for claims with confidence score 0.40–0.75 (2-hour resolution window)
- **Track_C**: Hold path for claims with confidence score < 0.40 (requires investigation)
- **Payout_Service**: Firebase Cloud Function that executes simulated UPI payouts via Razorpay test mode
- **Slab_Based_Payout**: Predefined payout amounts based on trigger severity and verified exposure duration
- **ML_Service**: External Python FastAPI microservice providing fraud detection and confidence scoring endpoints
- **TriggerEvent**: Firestore document representing a detected parametric disruption (rain, heat, AQI, zone closure, platform outage)
- **Claim**: Firestore document representing an auto-initiated parametric claim
- **Payout**: Firestore document representing a simulated or live payout transaction
- **FraudSignal**: Firestore document representing a detected anomaly flagged by the fraud pipeline

## Requirements

### Requirement 1: Trigger Monitoring and Detection

**User Story:** As the system, I want to continuously monitor external data feeds for parametric trigger events, so that I can automatically initiate claims when thresholds are breached.

#### Acceptance Criteria

1. THE Trigger_Monitoring_Engine SHALL run as a scheduled Firebase Cloud Function every 15 minutes
2. THE Trigger_Monitoring_Engine SHALL poll 5 external data feeds: weather/rainfall, AQI, heat stress, zone closures, and platform operations
3. WHEN rainfall exceeds 50mm/hour in a zone during covered hours, THE Trigger_Monitoring_Engine SHALL create a TriggerEvent with type "heavy_rain" and severity based on duration
4. WHEN AQI exceeds 300 (hazardous) for more than 2 hours in a zone, THE Trigger_Monitoring_Engine SHALL create a TriggerEvent with type "hazardous_aqi"
5. WHEN heat index exceeds 41°C (WBGT equivalent) during afternoon hours, THE Trigger_Monitoring_Engine SHALL create a TriggerEvent with type "extreme_heat"
6. WHEN a zone closure or access restriction is detected, THE Trigger_Monitoring_Engine SHALL create a TriggerEvent with type "zone_closure"
7. WHEN platform order volume drops below 30% of normal for more than 1 hour, THE Trigger_Monitoring_Engine SHALL create a TriggerEvent with type "platform_outage"
8. THE Trigger_Monitoring_Engine SHALL write complete audit data to each TriggerEvent: source feed name, raw measurement value, threshold applied, timestamp, affected zone, and city
9. THE Trigger_Monitoring_Engine SHALL calculate affected worker count by querying active policies in the trigger zone
10. WHEN a TriggerEvent is created, THE Trigger_Monitoring_Engine SHALL invoke the Claims_Orchestrator via Firestore trigger

### Requirement 2: Automatic Claim Initiation

**User Story:** As a worker with an active policy, I want claims to be automatically created when a trigger event affects my zone, so that I don't have to manually file paperwork during a disruption.

#### Acceptance Criteria

1. WHEN a TriggerEvent document is created in Firestore, THE Claims_Orchestrator SHALL automatically trigger via onCreate listener
2. THE Claims_Orchestrator SHALL query the policies collection for all active policies where weekStart ≤ trigger time ≤ weekEnd AND zone matches trigger zone
3. FOR EACH eligible policy, THE Claims_Orchestrator SHALL create a Claim document with status "under_review" and confidenceScore null
4. THE Claims_Orchestrator SHALL populate the Claim with: workerId, workerName (denormalized), policyId, triggerEventId, triggerType, triggerSeverity, zone, and a human-readable description
5. THE Claims_Orchestrator SHALL calculate initial payout amount based on the payout slab table (severity × exposure duration)
6. THE Claims_Orchestrator SHALL set payoutId to null initially (populated after payout execution)
7. THE Claims_Orchestrator SHALL set resolvedAt to null initially (populated when claim is approved or denied)
8. THE Claims_Orchestrator SHALL invoke the Fraud_Pipeline for each created claim
9. THE Claims_Orchestrator SHALL log claim creation with claim ID, worker ID, trigger type, and initial payout amount

### Requirement 3: Payout Slab Calculation

**User Story:** As the system, I want to calculate payout amounts using predefined slabs based on trigger severity and exposure duration, so that payouts are fair, predictable, and manipulation-resistant.

#### Acceptance Criteria

1. THE Claims_Orchestrator SHALL implement a payout slab table with 3 severity levels (moderate, high, severe) and 3 exposure durations (2-3 hours, 4-6 hours, 6+ hours)
2. FOR moderate severity with 2-3 hours exposure, THE Claims_Orchestrator SHALL calculate payout as ₹150–₹250
3. FOR moderate severity with 4-6 hours exposure, THE Claims_Orchestrator SHALL calculate payout as ₹250–₹400
4. FOR high severity with 2-3 hours exposure, THE Claims_Orchestrator SHALL calculate payout as ₹300–₹500
5. FOR high severity with 4-6 hours exposure, THE Claims_Orchestrator SHALL calculate payout as ₹500–₹750
6. FOR severe severity with 6+ hours exposure or zone-wide disruption, THE Claims_Orchestrator SHALL calculate payout as ₹600–₹1,000
7. THE Claims_Orchestrator SHALL cap total weekly payouts per worker at the policy's maxProtection amount
8. WHEN a worker has multiple claims in the same week, THE Claims_Orchestrator SHALL sum totalPaidOut from the WeeklyCoverage document and reject claims that would exceed maxProtection
9. THE Claims_Orchestrator SHALL adjust payout amounts based on the worker's declared shift hours (if trigger occurred outside working hours, reduce payout by 50%)
10. THE Claims_Orchestrator SHALL store the calculated payout amount in the Claim document's payoutAmount field

### Requirement 4: Fraud Detection Pipeline Integration

**User Story:** As the system, I want to score every claim for fraud risk using AI and rule-based checks, so that I can catch GPS spoofing, emulator usage, and coordinated fraud rings without penalizing genuine workers.

#### Acceptance Criteria

1. WHEN a Claim is created, THE Claims_Orchestrator SHALL construct a 20-feature fraud detection vector from worker history, device signals, location data, and behavioral patterns
2. THE Claims_Orchestrator SHALL call the ML_Service POST /fraud/score endpoint with the feature vector
3. THE Claims_Orchestrator SHALL extract the following features: motion_variance (from device sensors), network_type (wifi vs cellular), gps_accuracy_m, distance_from_home_km, speed_between_pings_kmh, claim_frequency_7d, emulator_flag, mock_location_flag, teleportation_flag, and simultaneous_claim_density_ratio
4. WHEN the ML_Service returns an anomaly score ≥ 0.7, THE Claims_Orchestrator SHALL create a FraudSignal document with severity "high" or "critical"
5. WHEN the ML_Service returns an anomaly score 0.3–0.7, THE Claims_Orchestrator SHALL create a FraudSignal document with severity "medium"
6. WHEN the ML_Service is unavailable or times out, THE Claims_Orchestrator SHALL fall back to hard-coded fraud rules: speed > 80 km/h → hold, emulator_flag → hold, claim_frequency_7d > 3 → hold
7. THE Claims_Orchestrator SHALL check for duplicate claims: query claims collection for same workerId + same triggerEventId and reject duplicates
8. THE Claims_Orchestrator SHALL check for coordinated fraud rings: query claims collection for claims in the same zone within a 3-minute window and flag if count > 50
9. THE Claims_Orchestrator SHALL store all fraud check results in the FraudSignal document with plain-language explanations
10. THE Claims_Orchestrator SHALL pass the fraud anomaly score to the confidence scoring step

### Requirement 5: Claim Confidence Scoring and Routing

**User Story:** As the system, I want to calculate a confidence score for each claim and route it to the appropriate approval track, so that high-confidence claims are auto-approved and suspicious claims are held for review.

#### Acceptance Criteria

1. AFTER fraud detection completes, THE Claims_Orchestrator SHALL construct a 9-feature confidence scoring vector combining trigger validation, zone overlap, fraud signals, and historical trust
2. THE Claims_Orchestrator SHALL call the ML_Service POST /confidence/score endpoint with the feature vector
3. THE Claims_Orchestrator SHALL extract the following features: trigger_confirmed (boolean), zone_overlap_score (0-1), emulator_flag, speed_plausible, duplicate_check_passed, fraud_anomaly_score (from previous step), historical_trust_score (from worker profile), claim_frequency_7d, device_consistency_score
4. WHEN the ML_Service returns a confidence score ≥ 0.75, THE Claims_Orchestrator SHALL route the claim to Track_A (auto-approve)
5. WHEN the ML_Service returns a confidence score 0.40–0.75, THE Claims_Orchestrator SHALL route the claim to Track_B (soft review with 2-hour window)
6. WHEN the ML_Service returns a confidence score < 0.40, THE Claims_Orchestrator SHALL route the claim to Track_C (hold for investigation)
7. THE Claims_Orchestrator SHALL update the Claim document with the confidence score and decision track
8. WHEN the ML_Service is unavailable, THE Claims_Orchestrator SHALL fall back to weighted rule scoring: 5 binary checks (trigger confirmed, zone overlap, no emulator, speed plausible, no duplicate) each worth 0.2 points
9. THE Claims_Orchestrator SHALL store the top 2 contributing features from the confidence model in the Claim document for admin review
10. THE Claims_Orchestrator SHALL log the confidence score, decision track, and routing reason

### Requirement 6: Track A - Auto-Approval and Payout

**User Story:** As a worker with a high-confidence claim, I want my claim to be auto-approved and paid out immediately, so that I receive financial support within minutes of a verified disruption.

#### Acceptance Criteria

1. WHEN a claim is routed to Track_A, THE Claims_Orchestrator SHALL update the Claim status to "auto_approved"
2. THE Claims_Orchestrator SHALL set the Claim's resolvedAt timestamp to the current server time
3. THE Claims_Orchestrator SHALL invoke the Payout_Service with the claim ID, worker ID, payout amount, and UPI ID
4. THE Payout_Service SHALL create a Payout document with status "pending" and method "upi"
5. THE Payout_Service SHALL call the Razorpay test mode API POST /payouts with the worker's UPI ID and payout amount
6. WHEN Razorpay returns a successful payout ID, THE Payout_Service SHALL update the Payout document with razorpayPayoutId and status "processing"
7. THE Payout_Service SHALL update the Claim document's payoutId field with the created Payout document ID
8. THE Payout_Service SHALL update the WeeklyCoverage document's totalPaidOut field by adding the payout amount
9. THE Payout_Service SHALL send a push notification to the worker via Firebase Cloud Messaging with the message "Your claim of ₹{amount} has been approved and paid to {upiId}"
10. THE Payout_Service SHALL log the payout execution with payout ID, claim ID, worker ID, amount, and Razorpay response

### Requirement 7: Track B - Soft Review with Auto-Resolution

**User Story:** As a worker with a borderline-confidence claim, I want my claim to be held for a short review period while additional data arrives, so that temporary network issues don't cause my claim to be denied.

#### Acceptance Criteria

1. WHEN a claim is routed to Track_B, THE Claims_Orchestrator SHALL update the Claim status to "under_review"
2. THE Claims_Orchestrator SHALL set a 2-hour review window starting from the claim creation time
3. THE Claims_Orchestrator SHALL send a push notification to the worker with the message "We're verifying your claim — this usually takes under 2 hours. You don't need to do anything right now."
4. THE Claims_Orchestrator SHALL schedule a delayed Cloud Function invocation to re-evaluate the claim after 2 hours
5. DURING the 2-hour window, THE Claims_Orchestrator SHALL listen for updated device signals (delayed GPS pings, sensor logs, network transitions) that sync when connectivity improves
6. WHEN new data arrives, THE Claims_Orchestrator SHALL re-calculate the confidence score using the updated feature vector
7. IF the updated confidence score reaches ≥ 0.75, THE Claims_Orchestrator SHALL automatically route the claim to Track_A and proceed with auto-approval
8. IF the 2-hour window expires and confidence remains 0.40–0.75, THE Claims_Orchestrator SHALL surface the claim in the admin review queue with a pre-structured summary
9. THE admin SHALL be able to approve the claim with a single tap, which triggers the same payout flow as Track_A
10. THE Claims_Orchestrator SHALL log all re-evaluation attempts, confidence score changes, and final resolution path

### Requirement 8: Track C - Hold for Investigation

**User Story:** As the system, I want to hold low-confidence claims for investigation and notify the worker with a clear explanation, so that suspicious claims are blocked without silently denying genuine workers.

#### Acceptance Criteria

1. WHEN a claim is routed to Track_C, THE Claims_Orchestrator SHALL update the Claim status to "held"
2. THE Claims_Orchestrator SHALL send a push notification to the worker with a plain-language explanation: "We couldn't verify your location during this window. Our records show your device was connected to Wi-Fi at your registered home area."
3. THE Claims_Orchestrator SHALL provide a one-tap appeal option in the worker app where the worker can add context (e.g., "network outage", "phone switched") or upload supporting evidence
4. THE Claims_Orchestrator SHALL surface the held claim in the admin fraud review queue with the fraud signal details, confidence score breakdown, and top contributing features
5. THE admin SHALL be able to approve, deny, or request additional information from the worker
6. WHEN the admin approves a held claim, THE Claims_Orchestrator SHALL update the status to "approved" and invoke the Payout_Service
7. WHEN the admin denies a held claim, THE Claims_Orchestrator SHALL update the status to "denied", set payoutAmount to 0, and send a notification to the worker with the denial reason
8. IF a worker has 3 or more claims routed to Track_C in a rolling 30-day window, THE Claims_Orchestrator SHALL trigger a lightweight KYC re-check
9. THE Claims_Orchestrator SHALL never silently deny a claim — every denial must include a plain-language reason visible to the worker
10. THE Claims_Orchestrator SHALL log all Track_C routing decisions, admin actions, and appeal submissions

### Requirement 9: Razorpay Test Mode Payout Integration

**User Story:** As the system, I want to execute simulated UPI payouts via Razorpay test mode, so that I can demonstrate the complete payout flow without real money movement.

#### Acceptance Criteria

1. THE Payout_Service SHALL use Razorpay test mode API credentials stored in Firebase environment variables
2. THE Payout_Service SHALL call the Razorpay POST /payouts endpoint with the following payload: account_number (test account), fund_account_id (UPI VPA), amount (in paise), currency ("INR"), mode ("UPI"), purpose ("payout"), and reference_id (claim ID)
3. WHEN Razorpay returns a 200 response with payout ID, THE Payout_Service SHALL update the Payout document with razorpayPayoutId and status "processing"
4. THE Payout_Service SHALL register a webhook handler at /api/webhooks/razorpay (Vercel API route) to receive payout status updates
5. WHEN Razorpay sends a webhook with event "payout.processed", THE webhook handler SHALL update the Payout document status to "completed" and set paidAt timestamp
6. WHEN Razorpay sends a webhook with event "payout.failed" or "payout.reversed", THE webhook handler SHALL update the Payout document status to "failed" and set failureReason
7. THE webhook handler SHALL verify the Razorpay webhook signature using the webhook secret before processing any events
8. THE Payout_Service SHALL handle Razorpay API errors gracefully: if the API call fails, set Payout status to "failed" and log the error response
9. THE Payout_Service SHALL retry failed payouts up to 3 times with exponential backoff (1 minute, 5 minutes, 15 minutes)
10. THE Payout_Service SHALL log all Razorpay API calls, responses, and webhook events for audit purposes

### Requirement 10: Worker Dashboard Claim Visibility

**User Story:** As a worker, I want to see all my claims with their status, confidence score, and payout amount on my dashboard, so that I understand what happened with each claim.

#### Acceptance Criteria

1. THE worker claims page SHALL query the claims collection filtered by workerId and ordered by createdAt descending
2. FOR EACH claim, THE worker claims page SHALL display: trigger type icon, trigger type label, zone name, created date/time, status badge, confidence score percentage, and payout amount
3. THE worker claims page SHALL use color-coded status badges: green for "auto_approved" and "approved", yellow for "under_review", red for "held", and gray for "denied"
4. THE worker claims page SHALL display a confidence score progress bar with color: green for ≥ 75%, yellow for 40-75%, red for < 40%
5. WHEN a claim status is "under_review", THE worker claims page SHALL display "Pending..." instead of a payout amount
6. WHEN a claim status is "held", THE worker claims page SHALL display a "View Details" button that shows the hold reason and appeal option
7. THE worker claims page SHALL display a summary card showing: total claims count and total amount received (sum of all completed payouts)
8. THE worker claims page SHALL update in real-time using Firestore onSnapshot listeners so the worker sees status changes immediately
9. THE worker claims page SHALL display a human-readable description for each claim (e.g., "Severe rainfall in Koramangala zone. 6-hour work window lost.")
10. THE worker claims page SHALL be mobile-optimized with touch-friendly tap targets and readable text sizes

### Requirement 11: Admin Claims Review Dashboard

**User Story:** As an admin, I want to review all claims with filtering, search, and bulk actions, so that I can efficiently manage the claims queue and investigate fraud signals.

#### Acceptance Criteria

1. THE admin claims page SHALL query the claims collection with pagination (20 claims per page) and real-time updates
2. THE admin claims page SHALL provide filter options: status (all, under_review, held, auto_approved, approved, denied), trigger type, date range, and confidence score range
3. THE admin claims page SHALL provide a search input that filters by worker name or claim ID
4. FOR EACH claim, THE admin claims page SHALL display: claim ID, worker name, trigger type, zone, confidence score with progress bar, payout amount, status badge, and action buttons
5. THE admin claims page SHALL display action buttons for claims with status "under_review" or "held": Approve (green checkmark) and Hold (red X)
6. WHEN the admin clicks Approve, THE admin claims page SHALL call a Cloud Function to update the claim status to "approved" and trigger the payout flow
7. WHEN the admin clicks Hold, THE admin claims page SHALL show a modal to enter a hold reason, then update the claim status to "held"
8. THE admin claims page SHALL display a "View Details" button that opens a modal showing: full claim details, fraud signals, confidence score breakdown, top contributing features, trigger event details, and worker profile summary
9. THE admin claims page SHALL display a summary row showing: total claims count, claims by status, total payout volume, and average confidence score
10. THE admin claims page SHALL export filtered claims to CSV with all fields for offline analysis

### Requirement 12: Fraud Review Queue

**User Story:** As an admin, I want to see all fraud signals with severity, signal type, and affected claims, so that I can investigate suspicious patterns and take action on fraud rings.

#### Acceptance Criteria

1. THE admin fraud page SHALL query the fraudSignals collection filtered by status "open" and ordered by severity (critical > high > medium > low)
2. FOR EACH fraud signal, THE admin fraud page SHALL display: worker name, claim ID, signal type (e.g., "GPS-WiFi Mismatch", "Impossible Speed"), severity badge, details, and status
3. THE admin fraud page SHALL provide filter options: severity (all, critical, high, medium, low), signal type, and status (open, investigating, resolved, dismissed)
4. THE admin fraud page SHALL display action buttons: Investigate (opens claim details), Resolve (marks as resolved), and Dismiss (marks as false positive)
5. WHEN the admin clicks Investigate, THE admin fraud page SHALL open the claim details modal with the fraud signal highlighted
6. WHEN the admin clicks Resolve, THE admin fraud page SHALL update the fraud signal status to "resolved" and optionally update the associated claim status
7. WHEN the admin clicks Dismiss, THE admin fraud page SHALL update the fraud signal status to "dismissed" and log the dismissal reason
8. THE admin fraud page SHALL display a summary card showing: total open signals, signals by severity, and signals by type
9. THE admin fraud page SHALL highlight coordinated fraud rings: when multiple fraud signals share the same device fingerprint or UPI ID, group them visually
10. THE admin fraud page SHALL provide a "Block Worker" action that sets the worker's account status to "suspended" and prevents future policy purchases

### Requirement 13: Payout History and Reconciliation

**User Story:** As an admin, I want to see all payouts with their status, Razorpay transaction IDs, and failure reasons, so that I can reconcile payments and troubleshoot failed transactions.

#### Acceptance Criteria

1. THE admin dashboard SHALL include a Payouts tab that queries the payouts collection ordered by createdAt descending
2. FOR EACH payout, THE admin dashboard SHALL display: payout ID, claim ID, worker name, amount, method (UPI), UPI ID, status, Razorpay payout ID, and created/paid timestamps
3. THE admin dashboard SHALL provide filter options: status (all, pending, processing, completed, failed), date range, and amount range
4. THE admin dashboard SHALL display status badges: blue for "pending", yellow for "processing", green for "completed", red for "failed"
5. WHEN a payout status is "failed", THE admin dashboard SHALL display the failure reason (e.g., "Invalid UPI ID", "Razorpay API timeout")
6. THE admin dashboard SHALL provide a "Retry Payout" button for failed payouts that re-invokes the Payout_Service
7. THE admin dashboard SHALL display a summary card showing: total payouts count, total amount disbursed, success rate percentage, and average payout time
8. THE admin dashboard SHALL export payouts to CSV with all fields including Razorpay transaction IDs for reconciliation
9. THE admin dashboard SHALL display a chart showing daily payout volume and success rate over the last 30 days
10. THE admin dashboard SHALL link each payout to its associated claim and worker profile for quick navigation

### Requirement 14: Trigger Event Audit Trail

**User Story:** As an admin, I want to see all detected trigger events with their source data, thresholds, and affected workers, so that I can verify that triggers are firing correctly and audit the system's decisions.

#### Acceptance Criteria

1. THE admin triggers page SHALL query the triggerEvents collection ordered by startTime descending
2. FOR EACH trigger event, THE admin triggers page SHALL display: trigger type, severity, zone, city, start time, end time (or "ongoing"), affected workers count, confidence score, and result
3. THE admin triggers page SHALL provide filter options: trigger type, severity, city, zone, date range, and result (auto_approved, under_review, manual_override)
4. THE admin triggers page SHALL display audit fields: source feed name, raw measurement value, threshold applied, and timestamp
5. WHEN the admin clicks on a trigger event, THE admin triggers page SHALL open a modal showing: full trigger details, list of affected workers, list of created claims, and source feed raw payload
6. THE admin triggers page SHALL display a map visualization showing the affected zone boundary and worker locations at the time of the trigger
7. THE admin triggers page SHALL provide a "Manual Override" action that allows the admin to manually create a trigger event for testing or edge cases
8. THE admin triggers page SHALL display a summary card showing: total triggers this week, triggers by type, average affected workers per trigger, and average confidence score
9. THE admin triggers page SHALL export trigger events to CSV with all audit fields for regulatory compliance
10. THE admin triggers page SHALL display a timeline chart showing trigger frequency by type over the last 90 days

### Requirement 15: Push Notifications for Claim Lifecycle

**User Story:** As a worker, I want to receive push notifications at each stage of the claim lifecycle, so that I know when a claim is created, approved, held, or paid.

#### Acceptance Criteria

1. WHEN a claim is auto-created, THE Claims_Orchestrator SHALL send a push notification via Firebase Cloud Messaging with the message "A claim has been initiated for {trigger type} in your zone. We're verifying your eligibility."
2. WHEN a claim is auto-approved (Track A), THE Claims_Orchestrator SHALL send a push notification with the message "Your claim of ₹{amount} has been approved and paid to {upiId}"
3. WHEN a claim is routed to Track B (soft review), THE Claims_Orchestrator SHALL send a push notification with the message "We're verifying your claim — this usually takes under 2 hours. You don't need to do anything right now."
4. WHEN a Track B claim is auto-resolved to approved, THE Claims_Orchestrator SHALL send a push notification with the message "Your claim has been verified and approved. ₹{amount} has been paid to {upiId}"
5. WHEN a claim is held (Track C), THE Claims_Orchestrator SHALL send a push notification with the message "We couldn't verify your location during this window. Tap to view details and submit an appeal."
6. WHEN a held claim is approved by admin, THE Claims_Orchestrator SHALL send a push notification with the message "Your claim has been approved after review. ₹{amount} has been paid to {upiId}"
7. WHEN a claim is denied, THE Claims_Orchestrator SHALL send a push notification with the message "Your claim was not approved. Reason: {denial reason}. Tap to view details."
8. WHEN a payout fails, THE Payout_Service SHALL send a push notification with the message "We couldn't complete your payout to {upiId}. Please update your UPI ID in settings."
9. THE Claims_Orchestrator SHALL include deep links in all push notifications that open the relevant claim details page in the worker app
10. THE Claims_Orchestrator SHALL respect the worker's notification preferences (stored in the worker profile) and not send notifications if disabled

### Requirement 16: Weekly Coverage Tracking and Payout Caps

**User Story:** As the system, I want to track total payouts per worker per week and enforce the policy's maximum protection limit, so that the system remains financially sustainable.

#### Acceptance Criteria

1. WHEN a policy is purchased, THE system SHALL create a WeeklyCoverage document with totalPaidOut initialized to 0
2. WHEN a payout is completed, THE Payout_Service SHALL update the WeeklyCoverage document's totalPaidOut field by adding the payout amount
3. BEFORE creating a claim, THE Claims_Orchestrator SHALL query the WeeklyCoverage document and check if totalPaidOut + new payout amount > maxProtection
4. IF the payout would exceed maxProtection, THE Claims_Orchestrator SHALL cap the payout amount at (maxProtection - totalPaidOut) and log a warning
5. IF totalPaidOut already equals maxProtection, THE Claims_Orchestrator SHALL reject the claim with status "denied" and reason "Weekly protection limit reached"
6. THE Claims_Orchestrator SHALL update the WeeklyCoverage document's claimIds array by appending each new claim ID
7. THE Claims_Orchestrator SHALL update the WeeklyCoverage status to "claimed" when the first payout is made
8. THE worker dashboard SHALL display the WeeklyCoverage summary: premium paid, max protection, total paid out, and remaining protection
9. THE worker dashboard SHALL display a progress bar showing totalPaidOut / maxProtection percentage
10. THE admin dashboard SHALL display a report of workers who have reached or are close to their weekly protection limit

### Requirement 17: Error Handling and Resilience

**User Story:** As the system, I want to handle errors gracefully and retry failed operations, so that temporary failures don't cause claims to be lost or payouts to be missed.

#### Acceptance Criteria

1. WHEN the ML_Service is unavailable or times out, THE Claims_Orchestrator SHALL fall back to rule-based fraud detection and confidence scoring
2. WHEN the Razorpay API call fails, THE Payout_Service SHALL retry up to 3 times with exponential backoff (1 minute, 5 minutes, 15 minutes)
3. WHEN a Cloud Function execution fails, THE system SHALL log the error with full context (claim ID, worker ID, error message, stack trace) to Cloud Logging
4. WHEN a Firestore write fails due to contention, THE system SHALL retry the write up to 3 times with exponential backoff
5. WHEN a push notification fails to send, THE system SHALL log the failure but continue processing the claim (notifications are non-blocking)
6. WHEN a webhook signature verification fails, THE webhook handler SHALL return 401 Unauthorized and log the failed verification attempt
7. WHEN a claim is stuck in "under_review" for more than 24 hours, THE system SHALL automatically escalate it to the admin review queue
8. WHEN a payout is stuck in "processing" for more than 1 hour, THE system SHALL query the Razorpay API for the payout status and update accordingly
9. THE system SHALL implement idempotency for all critical operations: duplicate claim creation, duplicate payout execution, and duplicate webhook processing
10. THE system SHALL monitor Cloud Function execution times and alert if any function exceeds 30 seconds (indicating a performance issue)

### Requirement 18: Logging and Observability

**User Story:** As a developer, I want comprehensive logging for all claim lifecycle events, so that I can debug issues, audit decisions, and monitor system health.

#### Acceptance Criteria

1. THE Claims_Orchestrator SHALL log every claim creation with: claim ID, worker ID, trigger event ID, trigger type, zone, initial payout amount, and timestamp
2. THE Claims_Orchestrator SHALL log every fraud detection call with: claim ID, fraud score, risk level, top contributing features, and model used (ML or fallback)
3. THE Claims_Orchestrator SHALL log every confidence scoring call with: claim ID, confidence score, decision track, top contributing features, and model used
4. THE Claims_Orchestrator SHALL log every claim routing decision with: claim ID, decision track (A/B/C), confidence score, and routing reason
5. THE Payout_Service SHALL log every payout execution with: payout ID, claim ID, worker ID, amount, UPI ID, Razorpay payout ID, and status
6. THE Payout_Service SHALL log every Razorpay API call with: request payload, response status, response body, and execution time
7. THE webhook handler SHALL log every webhook event with: event type, payout ID, signature verification result, and processing outcome
8. THE Trigger_Monitoring_Engine SHALL log every trigger detection with: trigger type, zone, raw measurement value, threshold, affected workers count, and source feed
9. THE system SHALL use structured logging (JSON format) with consistent field names for easy parsing and querying
10. THE system SHALL integrate with Cloud Logging and provide a dashboard showing: claim creation rate, payout success rate, fraud detection rate, and average processing time

