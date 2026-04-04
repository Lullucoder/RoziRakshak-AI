import * as admin from 'firebase-admin';
import { logger } from './logger';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const firestore = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

/**
 * Get a document from Firestore with error handling
 */
export async function getDocument<T>(
  collectionPath: string,
  documentId: string
): Promise<T | null> {
  try {
    const docRef = firestore.collection(collectionPath).doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      logger.warn({
        service: 'firestore-helper',
        operation: 'get-document',
        collection: collectionPath,
        documentId,
        message: 'Document not found'
      });
      return null;
    }
    
    return { id: docSnap.id, ...docSnap.data() } as T;
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'get-document',
      collection: collectionPath,
      documentId,
      message: 'Failed to get document',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    throw error;
  }
}

/**
 * Update a document in Firestore with error handling
 */
export async function updateDocument(
  collectionPath: string,
  documentId: string,
  data: any
): Promise<void> {
  try {
    const docRef = firestore.collection(collectionPath).doc(documentId);
    await docRef.update({
      ...data,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    logger.info({
      service: 'firestore-helper',
      operation: 'update-document',
      collection: collectionPath,
      documentId,
      message: 'Document updated successfully'
    });
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'update-document',
      collection: collectionPath,
      documentId,
      message: 'Failed to update document',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    throw error;
  }
}

/**
 * Create a document in Firestore with error handling
 */
export async function createDocument(
  collectionPath: string,
  data: any,
  documentId?: string
): Promise<string> {
  try {
    const collectionRef = firestore.collection(collectionPath);
    const docRef = documentId ? collectionRef.doc(documentId) : collectionRef.doc();
    
    await docRef.set({
      ...data,
      id: docRef.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    logger.info({
      service: 'firestore-helper',
      operation: 'create-document',
      collection: collectionPath,
      documentId: docRef.id,
      message: 'Document created successfully'
    });
    
    return docRef.id;
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'create-document',
      collection: collectionPath,
      message: 'Failed to create document',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    throw error;
  }
}

/**
 * Query collection with pagination support
 */
export async function queryCollection<T>(
  collectionPath: string,
  filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
  orderBy?: { field: string; direction: 'asc' | 'desc' },
  limit?: number
): Promise<T[]> {
  try {
    let query: FirebaseFirestore.Query = firestore.collection(collectionPath);
    
    // Apply filters
    filters.forEach(filter => {
      query = query.where(filter.field, filter.operator, filter.value);
    });
    
    // Apply ordering
    if (orderBy) {
      query = query.orderBy(orderBy.field, orderBy.direction);
    }
    
    // Apply limit
    if (limit) {
      query = query.limit(limit);
    }
    
    const snapshot = await query.get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as T));
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'query-collection',
      collection: collectionPath,
      message: 'Failed to query collection',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    throw error;
  }
}

/**
 * Execute a transaction with error handling
 */
export async function executeTransaction<T>(
  transactionFn: (transaction: FirebaseFirestore.Transaction) => Promise<T>
): Promise<T> {
  try {
    return await firestore.runTransaction(transactionFn);
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'execute-transaction',
      message: 'Transaction failed',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    throw error;
  }
}

/**
 * Batch write operations with error handling
 */
export async function batchWrite(
  operations: Array<{
    type: 'create' | 'update' | 'delete';
    collectionPath: string;
    documentId: string;
    data?: any;
  }>
): Promise<void> {
  try {
    const batch = firestore.batch();
    
    operations.forEach(op => {
      const docRef = firestore.collection(op.collectionPath).doc(op.documentId);
      
      switch (op.type) {
        case 'create':
          batch.set(docRef, {
            ...op.data,
            id: docRef.id,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
          break;
        case 'update':
          batch.update(docRef, {
            ...op.data,
            updatedAt: FieldValue.serverTimestamp()
          });
          break;
        case 'delete':
          batch.delete(docRef);
          break;
      }
    });
    
    await batch.commit();
    
    logger.info({
      service: 'firestore-helper',
      operation: 'batch-write',
      operationsCount: operations.length,
      message: 'Batch write completed successfully'
    });
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'batch-write',
      message: 'Batch write failed',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    throw error;
  }
}

/**
 * Check if document exists
 */
export async function documentExists(
  collectionPath: string,
  documentId: string
): Promise<boolean> {
  try {
    const docRef = firestore.collection(collectionPath).doc(documentId);
    const docSnap = await docRef.get();
    return docSnap.exists;
  } catch (error: any) {
    logger.error({
      service: 'firestore-helper',
      operation: 'document-exists',
      collection: collectionPath,
      documentId,
      message: 'Failed to check document existence',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
    return false;
  }
}
