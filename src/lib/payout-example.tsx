/**
 * Payout Service - Usage Examples
 * 
 * This file demonstrates how to use the payout service
 * in different scenarios
 */

import { getAuth } from 'firebase/auth';
import { useState } from 'react';

/**
 * Example 1: Initiate payout from claims orchestrator
 */
export async function initiatePayoutFromOrchestrator(
  claimId: string,
  workerId: string,
  amountInr: number,
  upiId: string
) {
  try {
    // Get admin token (server-side only)
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const idToken = await user.getIdToken();
    
    // Call payout initiation API
    const response = await fetch('/api/payouts/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        claim_id: claimId,
        worker_id: workerId,
        amount_inr: amountInr,
        upi_id: upiId
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to initiate payout');
    }
    
    const result = await response.json();
    
    console.log('Payout initiated:', {
      razorpayPayoutId: result.razorpay_payout_id,
      status: result.status
    });
    
    return result;
    
  } catch (error: any) {
    console.error('Error initiating payout:', error.message);
    throw error;
  }
}

/**
 * Example 2: Simulate payout for demo
 */
export async function simulatePayoutForDemo(
  claimId: string,
  workerId: string,
  amountInr: number
) {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const idToken = await user.getIdToken();
    
    // Call simulate payout API
    const response = await fetch('/api/payouts/simulate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        claim_id: claimId,
        worker_id: workerId,
        amount_inr: amountInr
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to simulate payout');
    }
    
    const result = await response.json();
    
    console.log('Demo payout simulated:', {
      payoutId: result.payout_id,
      status: result.status,
      demo: result.demo
    });
    
    return result;
    
  } catch (error: any) {
    console.error('Error simulating payout:', error.message);
    throw error;
  }
}

/**
 * Example 3: React component for admin payout button
 */
export function AdminPayoutButton({ claim }: { claim: any }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const handleInitiatePayout = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    try {
      await initiatePayoutFromOrchestrator(
        claim.id,
        claim.workerId,
        claim.payoutAmount,
        claim.worker.upiId
      );
      
      setSuccess(true);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSimulatePayout = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    try {
      await simulatePayoutForDemo(
        claim.id,
        claim.workerId,
        claim.payoutAmount
      );
      
      setSuccess(true);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={handleInitiatePayout}
          disabled={loading || claim.status !== 'approved'}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Initiate Payout'}
        </button>
        
        <button
          onClick={handleSimulatePayout}
          disabled={loading || claim.status !== 'approved'}
          className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Simulate Payout (Demo)'}
        </button>
      </div>
      
      {error && (
        <div className="text-red-600 text-sm">
          Error: {error}
        </div>
      )}
      
      {success && (
        <div className="text-green-600 text-sm">
          Payout initiated successfully!
        </div>
      )}
    </div>
  );
}

/**
 * Example 4: Server-side payout initiation (Cloud Function)
 */
export async function serverSidePayoutInitiation(
  claimId: string,
  workerId: string,
  amountInr: number,
  upiId: string
) {
  // Import server-side only
  const { initiateTestPayout } = await import('@/lib/payout');
  
  try {
    const razorpayPayoutId = await initiateTestPayout(
      claimId,
      workerId,
      amountInr,
      upiId
    );
    
    console.log('Payout initiated:', razorpayPayoutId);
    return razorpayPayoutId;
    
  } catch (error: any) {
    console.error('Failed to initiate payout:', error.message);
    throw error;
  }
}

/**
 * Example 5: Check payout status
 */
export async function checkPayoutStatus(payoutId: string) {
  const { adminDb } = await import('@/lib/firebase-admin');
  
  const payoutDoc = await adminDb.collection('payouts').doc(payoutId).get();
  
  if (!payoutDoc.exists) {
    throw new Error('Payout not found');
  }
  
  const payout = payoutDoc.data()!;
  
  return {
    id: payoutId,
    status: payout.status,
    amount: payout.amount_inr,
    claimId: payout.claim_id,
    workerId: payout.worker_id,
    initiatedAt: payout.initiated_at,
    paidAt: payout.paid_at,
    failureReason: payout.failure_reason
  };
}

/**
 * Example 6: Get worker payout history
 */
export async function getWorkerPayoutHistory(workerId: string) {
  const { adminDb } = await import('@/lib/firebase-admin');
  
  const workerDoc = await adminDb.collection('workers').doc(workerId).get();
  
  if (!workerDoc.exists) {
    throw new Error('Worker not found');
  }
  
  const worker = workerDoc.data()!;
  
  return {
    payoutHistory: worker.payout_history || [],
    totalPayoutsReceived: worker.total_payouts_received || 0
  };
}

/**
 * Example 7: Retry failed payout
 */
export async function retryFailedPayout(payoutId: string) {
  const { adminDb } = await import('@/lib/firebase-admin');
  const { initiateTestPayout } = await import('@/lib/payout');
  
  // Get failed payout
  const payoutDoc = await adminDb.collection('payouts').doc(payoutId).get();
  
  if (!payoutDoc.exists) {
    throw new Error('Payout not found');
  }
  
  const payout = payoutDoc.data()!;
  
  if (payout.status !== 'failed') {
    throw new Error('Payout is not in failed state');
  }
  
  // Retry payout
  const razorpayPayoutId = await initiateTestPayout(
    payout.claim_id,
    payout.worker_id,
    payout.amount_inr,
    payout.upi_id
  );
  
  console.log('Payout retried:', razorpayPayoutId);
  return razorpayPayoutId;
}

/**
 * Example 8: Bulk payout processing
 */
export async function processBulkPayouts(claimIds: string[]) {
  const results = [];
  
  for (const claimId of claimIds) {
    try {
      // Get claim details
      const { adminDb } = await import('@/lib/firebase-admin');
      const claimDoc = await adminDb.collection('claims').doc(claimId).get();
      
      if (!claimDoc.exists) {
        results.push({ claimId, success: false, error: 'Claim not found' });
        continue;
      }
      
      const claim = claimDoc.data()!;
      
      // Check if approved
      if (claim.status !== 'approved' && claim.status !== 'auto_approved') {
        results.push({ claimId, success: false, error: 'Claim not approved' });
        continue;
      }
      
      // Get worker details
      const workerDoc = await adminDb.collection('workers').doc(claim.workerId).get();
      
      if (!workerDoc.exists) {
        results.push({ claimId, success: false, error: 'Worker not found' });
        continue;
      }
      
      const worker = workerDoc.data()!;
      
      // Initiate payout
      const { initiateTestPayout } = await import('@/lib/payout');
      const razorpayPayoutId = await initiateTestPayout(
        claimId,
        claim.workerId,
        claim.payoutAmount,
        worker.upiId
      );
      
      results.push({ claimId, success: true, razorpayPayoutId });
      
    } catch (error: any) {
      results.push({ claimId, success: false, error: error.message });
    }
  }
  
  return results;
}

// Note: Add React import if using components
declare const React: any;
