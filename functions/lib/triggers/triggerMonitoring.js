"use strict";
/**
 * Trigger Monitoring Engine
 *
 * Evaluates external feed data against predefined thresholds to detect
 * trigger events that warrant automatic claim creation.
 *
 * Trigger Types:
 * 1. Heavy Rainfall (>50mm/hour)
 * 2. Poor Air Quality (AQI >300)
 * 3. Extreme Heat (Heat Index >42°C)
 * 4. Zone Closure (access restricted)
 * 5. Platform Disruption (order volume <30% of baseline)
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
exports.TRIGGER_THRESHOLDS = void 0;
exports.evaluateTriggerThresholds = evaluateTriggerThresholds;
exports.calculateTriggerSeverity = calculateTriggerSeverity;
exports.createTriggerEvent = createTriggerEvent;
exports.endTriggerEvent = endTriggerEvent;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("../utils/logger"));
const firestore_1 = require("../utils/firestore");
/**
 * Trigger Threshold Definitions
 * Each threshold defines when a trigger event should be created
 */
exports.TRIGGER_THRESHOLDS = [
    // 1. Heavy Rainfall
    {
        type: 'heavy_rain',
        condition: (data) => {
            return (data.rainfall_mm_per_hour || 0) > 0;
        },
        severity: (data) => {
            const rainfall = data.rainfall_mm_per_hour || 0;
            if (rainfall >= 100)
                return 'severe';
            if (rainfall >= 50)
                return 'high';
            return 'moderate';
        },
        description: 'Heavy rainfall detected'
    },
    // 2. Poor Air Quality
    {
        type: 'hazardous_aqi',
        condition: (data) => {
            return (data.aqi || 0) > 200;
        },
        severity: (data) => {
            const aqi = data.aqi || 0;
            if (aqi >= 400)
                return 'severe';
            if (aqi >= 300)
                return 'high';
            return 'moderate';
        },
        description: 'Poor air quality detected'
    },
    // 3. Extreme Heat
    {
        type: 'extreme_heat',
        condition: (data) => {
            return (data.heat_index_celsius || 0) > 38;
        },
        severity: (data) => {
            const heatIndex = data.heat_index_celsius || 0;
            if (heatIndex >= 45)
                return 'severe';
            if (heatIndex >= 42)
                return 'high';
            return 'moderate';
        },
        description: 'Extreme heat detected'
    },
    // 4. Zone Closure
    {
        type: 'zone_closure',
        condition: (data) => {
            return data.access_restricted === true;
        },
        severity: (data) => {
            // Zone closures are always high severity
            return 'high';
        },
        description: 'Zone access restricted'
    },
    // 5. Platform Disruption
    {
        type: 'platform_outage',
        condition: (data) => {
            return (data.order_volume_percent || 100) < 30;
        },
        severity: (data) => {
            const volumePercent = data.order_volume_percent || 100;
            if (volumePercent < 10)
                return 'severe';
            if (volumePercent < 20)
                return 'high';
            return 'moderate';
        },
        description: 'Platform order volume disruption'
    }
];
/**
 * Evaluate all trigger thresholds against external feed data
 * Returns array of triggered events
 */
function evaluateTriggerThresholds(data) {
    const triggeredEvents = [];
    for (const threshold of exports.TRIGGER_THRESHOLDS) {
        if (threshold.condition(data)) {
            const severity = threshold.severity(data);
            // Extract raw measurement value based on trigger type
            let rawValue = 0;
            switch (threshold.type) {
                case 'heavy_rain':
                    rawValue = data.rainfall_mm_per_hour || 0;
                    break;
                case 'hazardous_aqi':
                    rawValue = data.aqi || 0;
                    break;
                case 'extreme_heat':
                    rawValue = data.heat_index_celsius || 0;
                    break;
                case 'zone_closure':
                    rawValue = data.access_restricted || false;
                    break;
                case 'platform_outage':
                    rawValue = data.order_volume_percent || 0;
                    break;
            }
            triggeredEvents.push({
                type: threshold.type,
                severity,
                description: threshold.description,
                rawValue
            });
            logger.info({
                service: 'trigger_monitoring',
                operation: 'threshold_triggered',
                message: `Threshold triggered: ${threshold.type}`,
                type: threshold.type,
                severity,
                zone: data.zone,
                city: data.city,
                rawValue
            });
        }
    }
    return triggeredEvents;
}
/**
 * Calculate trigger severity based on measurement value and duration
 */
function calculateTriggerSeverity(type, measurementValue, durationHours) {
    switch (type) {
        case 'heavy_rain':
            if (measurementValue >= 100)
                return 'severe';
            if (measurementValue >= 50)
                return 'high';
            return 'moderate';
        case 'hazardous_aqi':
            if (measurementValue >= 400)
                return 'severe';
            if (measurementValue >= 300)
                return 'high';
            return 'moderate';
        case 'extreme_heat':
            if (measurementValue >= 45)
                return 'severe';
            if (measurementValue >= 42)
                return 'high';
            return 'moderate';
        case 'zone_closure':
            // Zone closures are always high severity
            return 'high';
        case 'platform_outage':
            if (measurementValue < 10)
                return 'severe';
            if (measurementValue < 20)
                return 'high';
            return 'moderate';
        default:
            return 'moderate';
    }
}
/**
 * Create a TriggerEvent document in Firestore
 */
async function createTriggerEvent(type, severity, zone, city, sourceFeed, rawMeasurementValue, thresholdApplied, description) {
    try {
        // Calculate affected workers count by querying active policies in the zone
        const affectedWorkersCount = await calculateAffectedWorkersCount(zone, city);
        const triggerEventData = {
            type,
            severity,
            zone,
            city,
            startTime: admin.firestore.FieldValue.serverTimestamp(),
            endTime: null,
            affectedWorkersCount,
            description,
            // Audit trail fields
            sourceFeed,
            rawMeasurementValue,
            thresholdApplied,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await (0, firestore_1.createDocument)('triggerEvents', triggerEventData);
        const triggerEventId = docRef;
        logger.info({
            service: 'trigger_monitoring',
            operation: 'trigger_event_created',
            message: 'Trigger event created',
            triggerEventId,
            type,
            severity,
            zone,
            city,
            affectedWorkersCount
        });
        return triggerEventId;
    }
    catch (error) {
        logger.error({
            service: 'trigger_monitoring',
            operation: 'create_trigger_event_error',
            message: `Failed to create trigger event: ${error.message}`,
            type,
            zone,
            city,
            error: error.message
        });
        throw error;
    }
}
/**
 * Calculate the number of workers affected by a trigger event
 * Queries active policies in the specified zone
 */
async function calculateAffectedWorkersCount(zone, city) {
    const db = admin.firestore();
    try {
        // Query active policies in the zone
        const policiesSnapshot = await db.collection('policies')
            .where('zone', '==', zone)
            .where('city', '==', city)
            .where('status', '==', 'active')
            .get();
        return policiesSnapshot.size;
    }
    catch (error) {
        logger.warn({
            service: 'trigger_monitoring',
            operation: 'calculate_affected_workers_error',
            message: `Failed to calculate affected workers: ${error.message}`,
            zone,
            city,
            error: error.message
        });
        // Return 0 if query fails
        return 0;
    }
}
/**
 * End a trigger event by setting the endTime
 */
async function endTriggerEvent(triggerEventId) {
    const db = admin.firestore();
    try {
        await db.collection('triggerEvents').doc(triggerEventId).update({
            endTime: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        logger.info({
            service: 'trigger_monitoring',
            operation: 'trigger_event_ended',
            message: 'Trigger event ended',
            triggerEventId
        });
    }
    catch (error) {
        logger.error({
            service: 'trigger_monitoring',
            operation: 'end_trigger_event_error',
            message: `Failed to end trigger event: ${error.message}`,
            triggerEventId,
            error: error.message
        });
    }
}
//# sourceMappingURL=triggerMonitoring.js.map