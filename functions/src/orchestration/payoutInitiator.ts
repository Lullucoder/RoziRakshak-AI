/**
 * Payout Initiator - Step 7 of Claims Orchestration
 * Creates payout document and invokes payout service
 */

import { createDocument, updateDocument, Timestamp } from '../utils/firestore';
import { logger } from '../utils/logger';
import { ClaimContext } from '../types/claim';

/**
 * Initiate payout for approved claim
 */
export async function initiatePayout(
  claimId: string,
  claimContext: ClaimContext,
  payoutAmount: number
): Promise<void> {
  const { worker } = claimContext;
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'initiate-payout',
    claimId,
    workerId: worker.uid,
    payoutAmount,
    message: 'Initiating payout'
  });
  
  try {
    // Create Payout document
    const payoutId = await createDocument('payouts', {
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
      createdAt: Timestamp.now()
    });
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'initiate-payout',
      claimId,
      payoutId,
      message: 'Payout document created'
    });
    
    // Update claim with payout ID and status
    await updateDocument('claims', claimId, {
      payoutId,
      status: 'payout_initiated',
      payoutAmount
    });
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'initiate-payout',
      claimId,
      payoutId,
      message: 'Claim updated with payout ID'
    });
    
    // TODO: Invoke payout service to call Razorpay API (Task 14.1)
    // For now, we just create the payout document
    // The actual Razorpay integration will be implemented in payoutService.ts
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'initiate-payout',
      claimId,
      payoutId,
      message: 'Payout initiated successfully'
    });
    
  } catch (error: any) {
    logger.error({
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
