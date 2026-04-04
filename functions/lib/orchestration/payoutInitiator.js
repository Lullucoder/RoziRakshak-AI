"use strict";
/**
 * Payout Initiator - Step 7 of Claims Orchestration
 * Creates payout document and invokes payout service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiatePayout = initiatePayout;
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
/**
 * Initiate payout for approved claim
 */
async function initiatePayout(claimId, claimContext, payoutAmount) {
    const { worker } = claimContext;
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'initiate-payout',
        claimId,
        workerId: worker.uid,
        payoutAmount,
        message: 'Initiating payout'
    });
    try {
        // Create Payout document
        const payoutId = await (0, firestore_1.createDocument)('payouts', {
            claimId,
            workerId: worker.uid,
            workerName: worker.name,
            amount: payoutAmount,
            currency: 'INR',
            method: 'upi',
            upiId: worker.upiId,
            status: 'pending',
            razorpayPayoutId: null,
            razorpayFundAccountId: null,
            razorpayReferenceId: `claim_${claimId}_${Date.now()}`,
            failureReason: null,
            retryCount: 0,
            paidAt: null,
            createdAt: firestore_1.Timestamp.now()
        });
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'initiate-payout',
            claimId,
            payoutId,
            message: 'Payout document created'
        });
        // Update claim with payout ID and status
        await (0, firestore_1.updateDocument)('claims', claimId, {
            payoutId,
            status: 'payout_initiated',
            payoutAmount
        });
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'initiate-payout',
            claimId,
            payoutId,
            message: 'Claim updated with payout ID'
        });
        // TODO: Invoke payout service to call Razorpay API (Task 14.1)
        // For now, we just create the payout document
        // The actual Razorpay integration will be implemented in payoutService.ts
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'initiate-payout',
            claimId,
            payoutId,
            message: 'Payout initiated successfully'
        });
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claims-orchestrator',
            operation: 'initiate-payout',
            claimId,
            message: 'Failed to initiate payout',
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code || 'UNKNOWN'
            }
        });
        throw error;
    }
}
//# sourceMappingURL=payoutInitiator.js.map