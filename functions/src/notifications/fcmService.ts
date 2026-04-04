/**
 * Firebase Cloud Messaging Service
 * Sends push notifications to workers
 */

import * as admin from 'firebase-admin';
import { getDocument } from '../utils/firestore';
import { logger } from '../utils/logger';

interface NotificationPayload {
  title: string;
  body: string;
  action?: string;
  claimId?: string;
  payoutId?: string;
  deepLink?: string;
}

/**
 * Send push notification to worker
 */
export async function sendPushNotification(
  workerId: string,
  payload: NotificationPayload
): Promise<void> {
  logger.info({
    service: 'fcm-service',
    operation: 'send-notification',
    workerId,
    title: payload.title,
    message: 'Sending push notification'
  });
  
  try {
    // Fetch worker document to get FCM token
    const worker = await getDocument<any>('workers', workerId);
    
    if (!worker) {
      logger.warn({
        service: 'fcm-service',
        operation: 'send-notification',
        workerId,
        message: 'Worker not found'
      });
      return;
    }
    
    // Check notification preferences
    if (worker.notificationPreferences?.pushEnabled === false) {
      logger.info({
        service: 'fcm-service',
        operation: 'send-notification',
        workerId,
        message: 'Push notifications disabled for worker'
      });
      return;
    }
    
    const fcmToken = worker.fcmToken;
    
    if (!fcmToken) {
      logger.warn({
        service: 'fcm-service',
        operation: 'send-notification',
        workerId,
        message: 'FCM token not found for worker'
      });
      return;
    }
    
    // Build FCM message
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: {
        action: payload.action || 'default',
        claimId: payload.claimId || '',
        payoutId: payload.payoutId || '',
        deepLink: payload.deepLink || ''
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'claims'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };
    
    // Send notification
    const response = await admin.messaging().send(message);
    
    logger.info({
      service: 'fcm-service',
      operation: 'send-notification',
      workerId,
      messageId: response,
      message: 'Push notification sent successfully'
    });
    
  } catch (error: any) {
    // Log error but don't throw - notifications are non-blocking
    logger.error({
      service: 'fcm-service',
      operation: 'send-notification',
      workerId,
      message: 'Failed to send push notification',
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN'
      }
    });
  }
}

/**
 * Send claim status notification
 */
export async function sendClaimStatusNotification(
  workerId: string,
  claimId: string,
  status: string,
  additionalInfo?: string
): Promise<void> {
  const statusMessages: Record<string, { title: string; body: string }> = {
    auto_approved: {
      title: '✅ Claim Approved',
      body: 'Your claim has been automatically approved. Payout is being processed.'
    },
    under_review: {
      title: '⏳ Claim Under Review',
      body: 'Your claim is being reviewed by our team. We will notify you once the review is complete.'
    },
    held: {
      title: '⚠️ Claim Requires Review',
      body: additionalInfo || 'Your claim requires manual review. Please check the app for details.'
    },
    approved: {
      title: '✅ Claim Approved',
      body: 'Your claim has been approved. Payout is being processed.'
    },
    denied: {
      title: '❌ Claim Denied',
      body: additionalInfo || 'Your claim has been denied. Please check the app for details.'
    },
    payout_initiated: {
      title: '💰 Payout Initiated',
      body: 'Your payout is being processed. You will receive the amount shortly.'
    },
    paid: {
      title: '✅ Payment Completed',
      body: 'Your payout has been completed successfully. Check your UPI account.'
    }
  };
  
  const message = statusMessages[status] || {
    title: 'Claim Update',
    body: 'Your claim status has been updated.'
  };
  
  await sendPushNotification(workerId, {
    title: message.title,
    body: message.body,
    action: 'view_claim',
    claimId,
    deepLink: `rozirakshak://claim/${claimId}`
  });
}

/**
 * Send payout status notification
 */
export async function sendPayoutStatusNotification(
  workerId: string,
  payoutId: string,
  status: string,
  amount?: number,
  failureReason?: string
): Promise<void> {
  const statusMessages: Record<string, { title: string; body: (amount?: number, reason?: string) => string }> = {
    processing: {
      title: '⏳ Processing Payment',
      body: (amount) => `Your payment of ₹${amount} is being processed.`
    },
    completed: {
      title: '✅ Payment Successful',
      body: (amount) => `₹${amount} has been credited to your UPI account.`
    },
    failed: {
      title: '❌ Payment Failed',
      body: (amount, reason) => `Payment of ₹${amount} failed. ${reason || 'Please contact support.'}`
    },
    reversed: {
      title: '⚠️ Payment Reversed',
      body: (amount) => `Payment of ₹${amount} was reversed. Please contact support.`
    }
  };
  
  const message = statusMessages[status];
  
  if (message) {
    await sendPushNotification(workerId, {
      title: message.title,
      body: message.body(amount, failureReason),
      action: 'view_payout',
      payoutId,
      deepLink: `rozirakshak://payout/${payoutId}`
    });
  }
}
