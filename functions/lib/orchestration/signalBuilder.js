"use strict";
/**
 * STEP 2: Build Signal Vector
 * Constructs the 20-feature fraud detection vector
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSignalVector = buildSignalVector;
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
/**
 * Build the complete fraud signal vector with safe defaults
 */
async function buildSignalVector(context) {
    const { claim, triggerEvent, worker } = context;
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'build-signal-vector',
        claimId: claim.id,
        workerId: worker.uid,
        message: 'Building fraud signal vector'
    });
    // Compute claim_frequency_7d from Firestore
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentClaims = await (0, firestore_1.queryCollection)('claims', [
        { field: 'workerId', operator: '==', value: worker.uid },
        { field: 'createdAt', operator: '>=', value: firestore_1.Timestamp.fromDate(sevenDaysAgo) }
    ]);
    const claim_frequency_7d = recentClaims.length;
    // Compute days_since_registration
    const days_since_registration = Math.floor((Date.now() - worker.joinedDate.toMillis()) / (24 * 60 * 60 * 1000));
    // Compute zone_overlap
    const zone_overlap = triggerEvent.zone === worker.zone;
    // Compute payout_account_change_days (default to large number if no change)
    const payout_account_change_days = 365; // Default: no recent change
    // Build the complete signal vector with safe defaults
    const signalVector = {
        // Device signals with safe defaults
        motion_variance: 5.0,
        network_type: 'cellular',
        rtt_ms: 200,
        gps_accuracy_m: 50,
        emulator_flag: false,
        shared_device_count: 0,
        // Location signals with safe defaults
        distance_from_home_km: 2.0,
        route_continuity_score: 0.8,
        speed_between_pings_kmh: 25,
        // Behavioral signals (computed)
        claim_frequency_7d,
        days_since_registration,
        payout_account_change_days,
        simultaneous_claim_density_ratio: 1.0,
        claim_timestamp_cluster_size: 0,
        // Advanced fraud indicators with safe defaults
        mock_location_flag: false,
        wifi_vs_cellular: 'cellular',
        gps_accuracy_stddev: 15.0,
        teleportation_flag: false,
        zone_entry_plausibility: 0.8,
        historical_zone_match: zone_overlap
    };
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'build-signal-vector',
        claimId: claim.id,
        workerId: worker.uid,
        message: 'Signal vector built successfully',
        metadata: {
            claim_frequency_7d,
            days_since_registration,
            zone_overlap,
            trust_score: worker.trustScore
        }
    });
    return signalVector;
}
//# sourceMappingURL=signalBuilder.js.map