/**
 * Payout Calculator - Step 6 of Claims Orchestration
 * Computes payout amount based on trigger severity and exposure duration
 */

import { logger } from '../utils/logger';
import { ClaimContext } from '../types/claim';

/**
 * Payout slab table
 * Maps trigger severity and exposure duration to payout amount
 */
interface PayoutSlab {
  severity: 'moderate' | 'high' | 'severe';
  minHours: number;
  maxHours: number;
  payoutAmount: number;
}

const PAYOUT_SLAB_TABLE: PayoutSlab[] = [
  // Moderate severity
  { severity: 'moderate', minHours: 2, maxHours: 3, payoutAmount: 200 },
  { severity: 'moderate', minHours: 4, maxHours: 6, payoutAmount: 300 },
  
  // High severity
  { severity: 'high', minHours: 2, maxHours: 3, payoutAmount: 300 },
  { severity: 'high', minHours: 4, maxHours: 6, payoutAmount: 400 },
  
  // Severe severity
  { severity: 'severe', minHours: 2, maxHours: 3, payoutAmount: 500 },
  { severity: 'severe', minHours: 4, maxHours: 6, payoutAmount: 600 },
  { severity: 'severe', minHours: 7, maxHours: 24, payoutAmount: 800 },
];

/**
 * Compute payout amount based on trigger severity and exposure duration
 */
export async function computePayoutAmount(claimContext: ClaimContext): Promise<number> {
  const { claim, triggerEvent, policy } = claimContext;
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'compute-payout',
    claimId: claim.id,
    triggerSeverity: triggerEvent.severity,
    message: 'Computing payout amount'
  });
  
  // Calculate exposure duration in hours
  const exposureHours = calculateExposureHours(triggerEvent);
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'compute-payout',
    claimId: claim.id,
    exposureHours,
    message: `Calculated exposure duration: ${exposureHours} hours`
  });
  
  // Find matching slab
  const matchingSlab = findMatchingSlab(triggerEvent.severity, exposureHours);
  
  if (!matchingSlab) {
    logger.warn({
      service: 'claims-orchestrator',
      operation: 'compute-payout',
      claimId: claim.id,
      severity: triggerEvent.severity,
      exposureHours,
      message: 'No matching payout slab found, using minimum payout'
    });
    
    // Default to minimum payout if no slab matches
    return 150;
  }
  
  let payoutAmount = matchingSlab.payoutAmount;
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'compute-payout',
    claimId: claim.id,
    basePayout: payoutAmount,
    message: `Base payout from slab table: ₹${payoutAmount}`
  });
  
  // TODO: Apply 50% adjustment if trigger occurred outside shift hours (Task 11.2)
  
  // Cap at policy's max weekly protection
  const remainingProtection = calculateRemainingProtection(policy);
  
  if (payoutAmount > remainingProtection) {
    logger.info({
      service: 'claims-orchestrator',
      operation: 'compute-payout',
      claimId: claim.id,
      originalPayout: payoutAmount,
      cappedPayout: remainingProtection,
      message: `Payout capped at remaining weekly protection: ₹${remainingProtection}`
    });
    
    payoutAmount = remainingProtection;
  }
  
  // Ensure minimum payout of ₹100
  if (payoutAmount < 100) {
    payoutAmount = 100;
  }
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'compute-payout',
    claimId: claim.id,
    finalPayout: payoutAmount,
    message: `Final payout amount: ₹${payoutAmount}`
  });
  
  return payoutAmount;
}

/**
 * Calculate exposure duration in hours
 */
function calculateExposureHours(triggerEvent: any): number {
  const startTime = triggerEvent.startTime.toMillis();
  const endTime = triggerEvent.endTime ? triggerEvent.endTime.toMillis() : Date.now();
  
  const durationMs = endTime - startTime;
  const durationHours = durationMs / (1000 * 60 * 60);
  
  // Round to nearest hour
  return Math.round(durationHours);
}

/**
 * Find matching payout slab based on severity and exposure hours
 */
function findMatchingSlab(
  severity: 'moderate' | 'high' | 'severe',
  exposureHours: number
): PayoutSlab | null {
  // Find all slabs matching the severity
  const severitySlabs = PAYOUT_SLAB_TABLE.filter(slab => slab.severity === severity);
  
  // Find the slab where exposure hours fall within the range
  for (const slab of severitySlabs) {
    if (exposureHours >= slab.minHours && exposureHours <= slab.maxHours) {
      return slab;
    }
  }
  
  // If no exact match, return the highest slab for this severity
  if (severitySlabs.length > 0) {
    return severitySlabs[severitySlabs.length - 1];
  }
  
  return null;
}

/**
 * Calculate remaining protection from weekly coverage
 */
function calculateRemainingProtection(policy: any): number {
  // TODO: Query WeeklyCoverage document and calculate remaining (Task 11.3)
  // For now, return the policy's max weekly protection
  return policy.maxWeeklyProtection || 2000;
}
