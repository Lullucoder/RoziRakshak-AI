"use strict";
/**
 * STEP 1: Load Claim Context
 * Fetches all required documents for claim processing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadClaimContext = loadClaimContext;
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
/**
 * Load all context data needed for claim orchestration
 * Returns null if any required document is missing
 */
async function loadClaimContext(claimId) {
    const contextLogger = logger_1.logger;
    try {
        contextLogger.info({
            service: 'claims-orchestrator',
            operation: 'load-context',
            claimId,
            message: 'Starting context load'
        });
        // Step 1.1: Read the claim document
        const claim = await (0, firestore_1.getDocument)('claims', claimId);
        if (!claim) {
            await updateClaimStatus(claimId, 'error', 'Claim document not found');
            contextLogger.error({
                service: 'claims-orchestrator',
                operation: 'load-context',
                claimId,
                message: 'Claim document not found'
            });
            return null;
        }
        // Step 1.2: Fetch the linked triggerEvent
        const triggerEvent = await (0, firestore_1.getDocument)('triggerEvents', claim.triggerEventId);
        if (!triggerEvent) {
            await updateClaimStatus(claimId, 'error', 'Trigger event not found');
            contextLogger.error({
                service: 'claims-orchestrator',
                operation: 'load-context',
                claimId,
                triggerEventId: claim.triggerEventId,
                message: 'Trigger event not found'
            });
            return null;
        }
        // Step 1.3: Fetch the worker's profile
        const worker = await (0, firestore_1.getDocument)('workers', claim.workerId);
        if (!worker) {
            await updateClaimStatus(claimId, 'error', 'Worker profile not found');
            contextLogger.error({
                service: 'claims-orchestrator',
                operation: 'load-context',
                claimId,
                workerId: claim.workerId,
                message: 'Worker profile not found'
            });
            return null;
        }
        // Step 1.4: Fetch the worker's active policy
        const policy = await (0, firestore_1.getDocument)('policies', claim.policyId);
        if (!policy) {
            await updateClaimStatus(claimId, 'error', 'Active policy not found');
            contextLogger.error({
                service: 'claims-orchestrator',
                operation: 'load-context',
                claimId,
                policyId: claim.policyId,
                message: 'Active policy not found'
            });
            return null;
        }
        contextLogger.info({
            service: 'claims-orchestrator',
            operation: 'load-context',
            claimId,
            workerId: worker.uid,
            triggerEventId: triggerEvent.id,
            policyId: policy.id,
            message: 'Context loaded successfully'
        });
        return {
            claim,
            triggerEvent,
            worker,
            policy
        };
    }
    catch (error) {
        contextLogger.error({
            service: 'claims-orchestrator',
            operation: 'load-context',
            claimId,
            message: 'Failed to load context',
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code || 'UNKNOWN'
            }
        });
        await updateClaimStatus(claimId, 'error', `Context load failed: ${error.message}`);
        return null;
    }
}
/**
 * Helper function to update claim status with error reason
 */
async function updateClaimStatus(claimId, status, reason) {
    try {
        await (0, firestore_1.updateDocument)('claims', claimId, {
            status,
            holdReason: reason
        });
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claims-orchestrator',
            operation: 'update-claim-status',
            claimId,
            message: 'Failed to update claim status',
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code || 'UNKNOWN'
            }
        });
    }
}
//# sourceMappingURL=contextLoader.js.map