"use strict";
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
exports.Timestamp = exports.FieldValue = exports.firestore = void 0;
exports.getDocument = getDocument;
exports.updateDocument = updateDocument;
exports.createDocument = createDocument;
exports.queryCollection = queryCollection;
exports.executeTransaction = executeTransaction;
exports.batchWrite = batchWrite;
exports.documentExists = documentExists;
const admin = __importStar(require("firebase-admin"));
const logger_1 = require("./logger");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.firestore = admin.firestore();
exports.FieldValue = admin.firestore.FieldValue;
exports.Timestamp = admin.firestore.Timestamp;
/**
 * Get a document from Firestore with error handling
 */
async function getDocument(collectionPath, documentId) {
    try {
        const docRef = exports.firestore.collection(collectionPath).doc(documentId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            logger_1.logger.warn({
                service: 'firestore-helper',
                operation: 'get-document',
                collection: collectionPath,
                documentId,
                message: 'Document not found'
            });
            return null;
        }
        return Object.assign({ id: docSnap.id }, docSnap.data());
    }
    catch (error) {
        logger_1.logger.error({
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
async function updateDocument(collectionPath, documentId, data) {
    try {
        const docRef = exports.firestore.collection(collectionPath).doc(documentId);
        await docRef.update(Object.assign(Object.assign({}, data), { updatedAt: exports.FieldValue.serverTimestamp() }));
        logger_1.logger.info({
            service: 'firestore-helper',
            operation: 'update-document',
            collection: collectionPath,
            documentId,
            message: 'Document updated successfully'
        });
    }
    catch (error) {
        logger_1.logger.error({
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
async function createDocument(collectionPath, data, documentId) {
    try {
        const collectionRef = exports.firestore.collection(collectionPath);
        const docRef = documentId ? collectionRef.doc(documentId) : collectionRef.doc();
        await docRef.set(Object.assign(Object.assign({}, data), { id: docRef.id, createdAt: exports.FieldValue.serverTimestamp(), updatedAt: exports.FieldValue.serverTimestamp() }));
        logger_1.logger.info({
            service: 'firestore-helper',
            operation: 'create-document',
            collection: collectionPath,
            documentId: docRef.id,
            message: 'Document created successfully'
        });
        return docRef.id;
    }
    catch (error) {
        logger_1.logger.error({
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
async function queryCollection(collectionPath, filters, orderBy, limit) {
    try {
        let query = exports.firestore.collection(collectionPath);
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
        return snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    }
    catch (error) {
        logger_1.logger.error({
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
async function executeTransaction(transactionFn) {
    try {
        return await exports.firestore.runTransaction(transactionFn);
    }
    catch (error) {
        logger_1.logger.error({
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
async function batchWrite(operations) {
    try {
        const batch = exports.firestore.batch();
        operations.forEach(op => {
            const docRef = exports.firestore.collection(op.collectionPath).doc(op.documentId);
            switch (op.type) {
                case 'create':
                    batch.set(docRef, Object.assign(Object.assign({}, op.data), { id: docRef.id, createdAt: exports.FieldValue.serverTimestamp(), updatedAt: exports.FieldValue.serverTimestamp() }));
                    break;
                case 'update':
                    batch.update(docRef, Object.assign(Object.assign({}, op.data), { updatedAt: exports.FieldValue.serverTimestamp() }));
                    break;
                case 'delete':
                    batch.delete(docRef);
                    break;
            }
        });
        await batch.commit();
        logger_1.logger.info({
            service: 'firestore-helper',
            operation: 'batch-write',
            operationsCount: operations.length,
            message: 'Batch write completed successfully'
        });
    }
    catch (error) {
        logger_1.logger.error({
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
async function documentExists(collectionPath, documentId) {
    try {
        const docRef = exports.firestore.collection(collectionPath).doc(documentId);
        const docSnap = await docRef.get();
        return docSnap.exists;
    }
    catch (error) {
        logger_1.logger.error({
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
//# sourceMappingURL=firestore.js.map