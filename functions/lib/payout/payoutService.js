"use strict";
/**
 * Payout Service - Razorpay Integration
 * Handles payout execution via Razorpay API
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
exports.processPayout = void 0;
exports.invokePayoutService = invokePayoutService;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
const payoutRetry_1 = require("./payoutRetry");
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1/payouts';
/**
 * Cloud Function: Process pending payouts
 * Triggered when a Payout document is created with status 'pending'
 */
exports.processPayout = functions.firestore
    .document('payouts/{payoutId}')
    .onCreate(async (snapshot, context) => {
    const payout = snapshot.data();
    const payoutId = context.params.payoutId;
    // Only process pending payouts
    if (payout.status !== 'pending') {
        return;
    }
    logger_1.logger.info({
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
    }
    catch (error) {
        logger_1.logger.error({
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
async function invokePayoutService(payoutId, payout) {
    var _a, _b, _c, _d;
    logger_1.logger.info({
        service: 'payout-service',
        operation: 'invoke-razorpay',
        payoutId,
        amount: payout.amount,
        upiId: payout.upiId,
        message: 'Calling Razorpay Payout API'
    });
    try {
        // Get Razorpay credentials from environment
        const keyId = process.env.RAZORPAY_KEY_ID || ((_a = functions.config().razorpay) === null || _a === void 0 ? void 0 : _a.key_id);
        const keySecret = process.env.RAZORPAY_KEY_SECRET || ((_b = functions.config().razorpay) === null || _b === void 0 ? void 0 : _b.key_secret);
        const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER || ((_c = functions.config().razorpay) === null || _c === void 0 ? void 0 : _c.account_number);
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
        logger_1.logger.info({
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
            throw new Error(`Razorpay API error: ${((_d = responseData.error) === null || _d === void 0 ? void 0 : _d.description) || 'Unknown error'}`);
        }
        logger_1.logger.info({
            service: 'payout-service',
            operation: 'invoke-razorpay',
            payoutId,
            razorpayPayoutId: responseData.id,
            message: 'Razorpay payout created successfully'
        });
        // Update payout document with Razorpay response
        await (0, firestore_1.updateDocument)('payouts', payoutId, {
            status: 'processing',
            razorpayPayoutId: responseData.id,
            razorpayFundAccountId: responseData.fund_account_id
        });
        logger_1.logger.info({
            service: 'payout-service',
            operation: 'invoke-razorpay',
            payoutId,
            message: 'Payout status updated to processing'
        });
    }
    catch (error) {
        logger_1.logger.error({
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
        await (0, firestore_1.updateDocument)('payouts', payoutId, {
            status: 'failed',
            failureReason: error.message
        });
        // Schedule retry
        await (0, payoutRetry_1.schedulePayoutRetry)(payoutId, payout);
        throw error;
    }
}
//# sourceMappingURL=payoutService.js.map