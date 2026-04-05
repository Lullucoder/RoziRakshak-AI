"use strict";
/**
 * Payout Retry Logic
 * Implements exponential backoff retry for failed payouts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulePayoutRetry = schedulePayoutRetry;
exports.executePayoutRetry = executePayoutRetry;
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
const payoutService_1 = require("./payoutService");
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [
    2 * 60 * 1000, // 2 minutes
    4 * 60 * 1000, // 4 minutes
    8 * 60 * 1000 // 8 minutes
];
/**
 * Schedule payout retry with exponential backoff
 */
async function schedulePayoutRetry(payoutId, payout) {
    const attemptNumber = (payout.retryCount || 0) + 1;
    if (attemptNumber > MAX_RETRY_ATTEMPTS) {
        logger_1.logger.warn({
            service: 'payout-retry',
            operation: 'schedule-retry',
            payoutId,
            message: 'Max retry attempts reached, marking payout as permanently failed'
        });
        await (0, firestore_1.updateDocument)('payouts', payoutId, {
            status: 'failed',
            failureReason: `Failed after ${MAX_RETRY_ATTEMPTS} retry attempts`
        });
        return;
    }
    const delayMs = RETRY_DELAYS_MS[attemptNumber - 1];
    const scheduledAt = firestore_1.Timestamp.fromMillis(Date.now() + delayMs);
    logger_1.logger.info({
        service: 'payout-retry',
        operation: 'schedule-retry',
        payoutId,
        attemptNumber,
        delayMs,
        scheduledAt: scheduledAt.toDate().toISOString(),
        message: `Scheduling retry attempt ${attemptNumber}`
    });
    // Create retry document
    await (0, firestore_1.createDocument)('payoutRetries', {
        payoutId,
        claimId: payout.claimId,
        workerId: payout.workerId,
        attemptNumber,
        scheduledAt,
        status: 'scheduled',
        executedAt: null,
        result: null
    });
    // Update payout retry count
    await (0, firestore_1.updateDocument)('payouts', payoutId, {
        retryCount: attemptNumber,
        status: 'retry_scheduled'
    });
}
/**
 * Execute scheduled payout retry
 */
async function executePayoutRetry(retryId, retry) {
    const { payoutId, attemptNumber } = retry;
    logger_1.logger.info({
        service: 'payout-retry',
        operation: 'execute-retry',
        retryId,
        payoutId,
        attemptNumber,
        message: 'Executing payout retry'
    });
    try {
        // Mark retry as executing
        await (0, firestore_1.updateDocument)('payoutRetries', retryId, {
            status: 'executing',
            executedAt: firestore_1.Timestamp.now()
        });
        // Get payout document
        const payout = await (0, firestore_1.getDocument)('payouts', payoutId);
        if (!payout) {
            throw new Error('Payout document not found');
        }
        // Reset payout status to pending for retry
        await (0, firestore_1.updateDocument)('payouts', payoutId, {
            status: 'pending'
        });
        // Invoke payout service
        await (0, payoutService_1.invokePayoutService)(payoutId, payout);
        // Mark retry as successful
        await (0, firestore_1.updateDocument)('payoutRetries', retryId, {
            status: 'success',
            result: 'Payout retry successful'
        });
        logger_1.logger.info({
            service: 'payout-retry',
            operation: 'execute-retry',
            retryId,
            payoutId,
            message: 'Payout retry successful'
        });
    }
    catch (error) {
        logger_1.logger.error({
            service: 'payout-retry',
            operation: 'execute-retry',
            retryId,
            payoutId,
            message: 'Payout retry failed',
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code || 'UNKNOWN'
            }
        });
        // Mark retry as failed
        await (0, firestore_1.updateDocument)('payoutRetries', retryId, {
            status: 'failed',
            result: error.message
        });
        // Get updated payout to check retry count
        const payout = await (0, firestore_1.getDocument)('payouts', payoutId);
        if (payout) {
            // Schedule next retry if attempts remaining
            await schedulePayoutRetry(payoutId, payout);
        }
    }
}
//# sourceMappingURL=payoutRetry.js.map