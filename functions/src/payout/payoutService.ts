/**
 * Payout Service - Razorpay Integration
 * Handles payout execution via Razorpay API
 */

import * as functions from 'firebase-functions';
import { updateDocument } from '../utils/firestore';
import { logger } from '../utils/logger';
import { Payout } from '../types/payout';
import { schedulePayoutRetry } from './payoutRetry';

const RAZORPAY_API_URL = 'https://api.razorpay.com/v1/payouts';

/**
 * Cloud Function: Process pending payouts
 * Triggered when a Payout document is created with status 'pending'
 */
export const processPayout = functions.firestore
  .document('payouts/{payoutId}')
  .onCreate(async (snapshot, context) => {
    const payout = snapshot.data() as Payout;
    const payoutId = context.params.payoutId;
    
    // Only process pending payouts
    if (payout.status !== 'pending') {
      return;
    }
    
    logger.info({
      service: 'payout-service',
      operation: 'process-payout',
      payoutId,
      claimId: payout.claimId,
      workerId: payout.workerId,
      amount: payout.amount,
      message: 'Processing payout'
    });
    
    try {
      await invokePayoutService(payoutId, payout);
    } catch (error: any) {
      logger.error({
        service: 'payout-service',
        operation: 'process-payout',
        payoutId,
        message: 'Payout processing failed',
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code || 'UNKNOWN'
        }
      });
    }
  });

/**
 * Invoke Razorpay Payout API
 */
export async function invokePayoutService(payoutId: string, payout: Payout): Promise<void> {
  logger.info({
    service: 'payout-service',
    operation: 'invoke-razorpay',
    payoutId,
    amount: payout.amount,
    upiId: payout.upiId,
    message: 'Calling Razorpay Payout API'
  });
  
  try {
    // Get Razorpay credentials from environment
    const keyId = process.env.RAZORPAY_KEY_ID || functions.config().razorpay?.key_id;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || functions.config().razorpay?.key_secret;
    const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER || functions.config().razorpay?.account_number;
    
    if (!keyId || !keySecret || !accountNumber) {
      throw new Error('Razorpay credentials not configured');
    }
    
    // Build Razorpay API request
    const requestBody = {
      account_number: accountNumber,
      amount: payout.amount * 100, // Convert to paise
      currency: payout.currency,
      mode: 'UPI',
      purpose: 'payout',
      fund_account: {
        account_type: 'vpa',
        vpa: {
          address: payout.upiId
        },
        contact: {
          name: payout.workerName,
          type: 'employee'
        }
      },
      queue_if_low_balance: true,
      reference_id: payout.razorpayReferenceId,
      narration: `RoziRakshak claim payout - ${payout.claimId}`
    };
    
    // Create Authorization header (Basic auth)
    const authString = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    
    logger.info({
      service: 'payout-service',
      operation: 'invoke-razorpay',
      payoutId,
      message: 'Sending request to Razorpay'
    });
    
    // Call Razorpay API
    const response = await fetch(RAZORPAY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(`Razorpay API error: ${responseData.error?.description || 'Unknown error'}`);
    }
    
    logger.info({
      service: 'payout-service',
      operation: 'invoke-razorpay',
      payoutId,
      razorpayPayoutId: responseData.id,
      message: 'Razorpay payout created successfully'
    });
    
    // Update payout document with Razorpay response
    await updateDocument('payouts', payoutId, {
      status: 'processing',
      razorpayPayoutId: responseData.id,
      razorpayFundAccountId: responseData.fund_account_id
    });
    
    logger.info({
      service: 'payout-service',
      operation: 'invoke-razorpay',
      payoutId,
      message: 'Payout status updated to processing'
    });
    
  } catch (error: any) {
    logger.error({
      service: 'payout-service',
      operation: 'invoke-razorpay',
      payoutId,
      message: 'Razorpay API call failed',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    
    // Update payout status to failed
    await updateDocument('payouts', payoutId, {
      status: 'failed',
      failureReason: error.message
    });
    
    // Schedule retry
    await schedulePayoutRetry(payoutId, payout);
    
    throw error;
  }
}
