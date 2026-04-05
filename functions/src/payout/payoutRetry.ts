/**
 * Payout Retry Logic
 * Implements exponential backoff retry for failed payouts
 */

import { createDocument, updateDocument, Timestamp, getDocument } from '../utils/firestore';
import { logger } from '../utils/logger';
import { invokePayoutService } from './payoutService';
import { Payout } from '../types/payout';

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [
  2 * 60 * 1000,  // 2 minutes
  4 * 60 * 1000,  // 4 minutes
  8 * 60 * 1000   // 8 minutes
];

/**
 * Schedule payout retry with exponential backoff
 */
export async function schedulePayoutRetry(payoutId: string, payout: Payout): Promise<void> {
  const attemptNumber = (payout.retryCount || 0) + 1;
  
  if (attemptNumber > MAX_RETRY_ATTEMPTS) {
    logger.warn({
      service: 'payout-retry',
      operation: 'schedule-retry',
      payoutId,
      message: 'Max retry attempts reached, marking payout as permanently failed'
    });
    
    await updateDocument('payouts', payoutId, {
      status: 'failed',
      failureReason: `Failed after ${MAX_RETRY_ATTEMPTS} retry attempts`
    });
    
    return;
  }
  
  const delayMs = RETRY_DELAYS_MS[attemptNumber - 1];
  const scheduledAt = Timestamp.fromMillis(Date.now() + delayMs);
  
  logger.info({
    service: 'payout-retry',
    operation: 'schedule-retry',
    payoutId,
    attemptNumber,
    delayMs,
    scheduledAt: scheduledAt.toDate().toISOString(),
    message: `Scheduling retry attempt ${attemptNumber}`
  });
  
  // Create retry document
  await createDocument('payoutRetries', {
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
  await updateDocument('payouts', payoutId, {
    retryCount: attemptNumber,
    status: 'retry_scheduled'
  });
}

/**
 * Execute scheduled payout retry
 */
export async function executePayoutRetry(retryId: string, retry: any): Promise<void> {
  const { payoutId, attemptNumber } = retry;
  
  logger.info({
    service: 'payout-retry',
    operation: 'execute-retry',
    retryId,
    payoutId,
    attemptNumber,
    message: 'Executing payout retry'
  });
  
  try {
    // Mark retry as executing
    await updateDocument('payoutRetries', retryId, {
      status: 'executing',
      executedAt: Timestamp.now()
    });
    
    // Get payout document
    const payout = await getDocument<Payout>('payouts', payoutId);
    
    if (!payout) {
      throw new Error('Payout document not found');
    }
    
    // Reset payout status to pending for retry
    await updateDocument('payouts', payoutId, {
      status: 'pending'
    });
    
    // Invoke payout service
    await invokePayoutService(payoutId, payout);
    
    // Mark retry as successful
    await updateDocument('payoutRetries', retryId, {
      status: 'success',
      result: 'Payout retry successful'
    });
    
    logger.info({
      service: 'payout-retry',
      operation: 'execute-retry',
      retryId,
      payoutId,
      message: 'Payout retry successful'
    });
    
  } catch (error: any) {
    logger.error({
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
    await updateDocument('payoutRetries', retryId, {
      status: 'failed',
      result: error.message
    });
    
    // Get updated payout to check retry count
    const payout = await getDocument<Payout>('payouts', payoutId);
    
    if (payout) {
      // Schedule next retry if attempts remaining
      await schedulePayoutRetry(payoutId, payout);
    }
  }
}

