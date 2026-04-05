/**
 * Scheduled re-evaluation processor for Track B claims.
 * Runs periodically and executes due claim re-evaluations.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logger } from '../utils/logger';
import { reEvaluateClaim } from './claimRouter';

const MAX_BATCH_SIZE = 50;

export const processClaimReEvaluations = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();

    logger.info({
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
        logger.info({
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
        const data = doc.data() as { claimId?: string };
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
          await reEvaluateClaim(claimId);

          await doc.ref.update({
            status: 'completed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          succeeded += 1;
        } catch (error: any) {
          await doc.ref.update({
            status: 'failed',
            error: error?.message || 'Unknown error',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          failed += 1;

          logger.error({
            service: 'claim-re-evaluation-scheduler',
            operation: 're-evaluation-failed',
            claimId,
            message: error?.message || 'Unknown error during claim re-evaluation',
          });
        }
      }

      logger.info({
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
    } catch (error: any) {
      logger.error({
        service: 'claim-re-evaluation-scheduler',
        operation: 'run-failed',
        executionId: context.eventId,
        message: error?.message || 'Unknown scheduler failure',
      });
      throw error;
    }
  });
