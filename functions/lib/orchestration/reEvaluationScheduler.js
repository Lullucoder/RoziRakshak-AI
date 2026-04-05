"use strict";
/**
 * Scheduled re-evaluation processor for Track B claims.
 * Runs periodically and executes due claim re-evaluations.
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
exports.processClaimReEvaluations = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const logger_1 = require("../utils/logger");
const claimRouter_1 = require("./claimRouter");
const MAX_BATCH_SIZE = 50;
exports.processClaimReEvaluations = functions.pubsub
    .schedule('every 15 minutes')
    .onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    logger_1.logger.info({
        service: 'claim-re-evaluation-scheduler',
        operation: 'run-started',
        executionId: context.eventId,
        message: 'Starting scheduled claim re-evaluation run',
        metadata: {
            now: now.toISOString(),
        },
    });
    try {
        const snapshot = await db
            .collection('claimReEvaluations')
            .where('status', '==', 'pending')
            .where('scheduledAt', '<=', now)
            .limit(MAX_BATCH_SIZE)
            .get();
        if (snapshot.empty) {
            logger_1.logger.info({
                service: 'claim-re-evaluation-scheduler',
                operation: 'run-completed',
                executionId: context.eventId,
                message: 'No due re-evaluations found',
            });
            return { processed: 0, succeeded: 0, failed: 0 };
        }
        let succeeded = 0;
        let failed = 0;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const claimId = data.claimId;
            if (!claimId) {
                failed += 1;
                await doc.ref.update({
                    status: 'failed',
                    error: 'Missing claimId',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                continue;
            }
            try {
                await (0, claimRouter_1.reEvaluateClaim)(claimId);
                await doc.ref.update({
                    status: 'completed',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                succeeded += 1;
            }
            catch (error) {
                await doc.ref.update({
                    status: 'failed',
                    error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                failed += 1;
                logger_1.logger.error({
                    service: 'claim-re-evaluation-scheduler',
                    operation: 're-evaluation-failed',
                    claimId,
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error during claim re-evaluation',
                });
            }
        }
        logger_1.logger.info({
            service: 'claim-re-evaluation-scheduler',
            operation: 'run-completed',
            executionId: context.eventId,
            message: 'Claim re-evaluation run completed',
            metadata: {
                processed: snapshot.size,
                succeeded,
                failed,
            },
        });
        return { processed: snapshot.size, succeeded, failed };
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claim-re-evaluation-scheduler',
            operation: 'run-failed',
            executionId: context.eventId,
            message: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown scheduler failure',
        });
        throw error;
    }
});
//# sourceMappingURL=reEvaluationScheduler.js.map