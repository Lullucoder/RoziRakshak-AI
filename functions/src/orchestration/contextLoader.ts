/**
 * STEP 1: Load Claim Context
 * Fetches all required documents for claim processing
 */

import { ClaimContext, Claim, TriggerEvent, WorkerProfile, Policy } from '../types/claim';
import { getDocument, updateDocument } from '../utils/firestore';
import { logger } from '../utils/logger';

/**
 * Load all context data needed for claim orchestration
 * Returns null if any required document is missing
 */
export async function loadClaimContext(claimId: string): Promise<ClaimContext | null> {
  const contextLogger = logger;
  
  try {
    contextLogger.info({
      service: 'claims-orchestrator',
      operation: 'load-context',
      claimId,
      message: 'Starting context load'
    });
    
    // Step 1.1: Read the claim document
    const claim = await getDocument<Claim>('claims', claimId);
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
    const triggerEvent = await getDocument<TriggerEvent>('triggerEvents', claim.triggerEventId);
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
    const worker = await getDocument<WorkerProfile>('workers', claim.workerId);
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
    const policy = await getDocument<Policy>('policies', claim.policyId);
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
    
  } catch (error: any) {
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
async function updateClaimStatus(claimId: string, status: string, reason: string): Promise<void> {
  try {
    await updateDocument('claims', claimId, {
      status,
      holdReason: reason
    });
  } catch (error: any) {
    logger.error({
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
