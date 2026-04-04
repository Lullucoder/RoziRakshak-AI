"use strict";
/**
 * Firebase Cloud Messaging Service
 * Sends push notifications to workers
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = sendPushNotification;
exports.sendClaimStatusNotification = sendClaimStatusNotification;
exports.sendPayoutStatusNotification = sendPayoutStatusNotification;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
/**
 * Send push notification to worker
 */
async function sendPushNotification(workerId, payload) {
    var _a;
    logger_1.logger.info({
        service: 'fcm-service',
        operation: 'send-notification',
        workerId,
        title: payload.title,
        message: 'Sending push notification'
    });
    try {
        // Fetch worker document to get FCM token
        const worker = await (0, firestore_1.getDocument)('workers', workerId);
        if (!worker) {
            logger_1.logger.warn({
                service: 'fcm-service',
                operation: 'send-notification',
                workerId,
                message: 'Worker not found'
            });
            return;
        }
        // Check notification preferences
        if (((_a = worker.notificationPreferences) === null || _a === void 0 ? void 0 : _a.pushEnabled) === false) {
            logger_1.logger.info({
                service: 'fcm-service',
                operation: 'send-notification',
                workerId,
                message: 'Push notifications disabled for worker'
            });
            return;
        }
        const fcmToken = worker.fcmToken;
        if (!fcmToken) {
            logger_1.logger.warn({
                service: 'fcm-service',
                operation: 'send-notification',
                workerId,
                message: 'FCM token not found for worker'
            });
            return;
        }
        // Build FCM message
        const message = {
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
        logger_1.logger.info({
            service: 'fcm-service',
            operation: 'send-notification',
            workerId,
            messageId: response,
            message: 'Push notification sent successfully'
        });
    }
    catch (error) {
        // Log error but don't throw - notifications are non-blocking
        logger_1.logger.error({
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
async function sendClaimStatusNotification(workerId, claimId, status, additionalInfo) {
    const statusMessages = {
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
async function sendPayoutStatusNotification(workerId, payoutId, status, amount, failureReason) {
    const statusMessages = {
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
//# sourceMappingURL=fcmService.js.map