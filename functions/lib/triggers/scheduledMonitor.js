"use strict";
/**
 * Scheduled Trigger Monitor
 *
 * Cloud Function that runs every 15 minutes to:
 * 1. Poll all external feeds for monitored cities/zones
 * 2. Evaluate trigger thresholds
 * 3. Create TriggerEvent documents when thresholds are exceeded
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
exports.manualTriggerMonitor = exports.monitorTriggers = void 0;
const functions = __importStar(require("firebase-functions"));
const logger_1 = require("../utils/logger");
const externalFeeds_1 = require("./externalFeeds");
const triggerMonitoring_1 = require("./triggerMonitoring");
// Monitored cities and zones
const MONITORED_LOCATIONS = [
    { city: 'Mumbai', zones: ['Andheri', 'Bandra', 'Powai', 'Goregaon'] },
    { city: 'Delhi', zones: ['Connaught Place', 'Dwarka', 'Rohini', 'Saket'] },
    { city: 'Bangalore', zones: ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout'] },
    { city: 'Hyderabad', zones: ['Hitech City', 'Gachibowli', 'Madhapur', 'Kukatpally'] },
    { city: 'Pune', zones: ['Hinjewadi', 'Kothrud', 'Viman Nagar', 'Wakad'] }
];
/**
 * Scheduled Cloud Function - Runs every 15 minutes
 */
exports.monitorTriggers = functions.pubsub
    .schedule('every 15 minutes')
    .onRun(async (context) => {
    logger_1.logger.info({
        service: 'scheduled_monitor',
        operation: 'monitor_triggers_started',
        message: 'Starting trigger monitoring',
        executionId: context.eventId,
        timestamp: context.timestamp
    });
    const startTime = Date.now();
    let totalTriggersCreated = 0;
    const errors = [];
    try {
        const locationPromises = MONITORED_LOCATIONS.flatMap(location => location.zones.map(zone => processLocation(location.city, zone)));
        const results = await Promise.allSettled(locationPromises);
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                totalTriggersCreated += result.value;
            }
            else {
                errors.push(`Location ${index}: ${result.reason}`);
                logger_1.logger.error({
                    service: 'scheduled_monitor',
                    operation: 'location_processing_failed',
                    message: `Location processing failed: ${result.reason}`,
                    index
                });
            }
        });
        const duration = Date.now() - startTime;
        logger_1.logger.info({
            service: 'scheduled_monitor',
            operation: 'monitor_triggers_completed',
            message: 'Trigger monitoring completed',
            executionId: context.eventId,
            totalTriggersCreated,
            totalLocations: locationPromises.length,
            errors: errors.length,
            durationMs: duration
        });
        return {
            success: true,
            totalTriggersCreated,
            totalLocations: locationPromises.length,
            errors: errors.length,
            durationMs: duration
        };
    }
    catch (error) {
        logger_1.logger.error({
            service: 'scheduled_monitor',
            operation: 'monitor_triggers_error',
            message: `Trigger monitoring error: ${error.message}`,
            executionId: context.eventId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
});
/**
 * Process a single city/zone location
 */
async function processLocation(city, zone) {
    logger_1.logger.debug({
        service: 'scheduled_monitor',
        operation: 'process_location_started',
        message: 'Processing location',
        city,
        zone
    });
    try {
        const feeds = await (0, externalFeeds_1.fetchAllFeeds)(city, zone);
        let triggersCreated = 0;
        // Process weather data (rainfall)
        if (feeds.weather) {
            const feedData = {
                rainfall_mm_per_hour: feeds.weather.rainfallMm,
                timestamp: feeds.weather.timestamp,
                zone,
                city,
                source: feeds.weather.source
            };
            const triggers = (0, triggerMonitoring_1.evaluateTriggerThresholds)(feedData);
            for (const trigger of triggers) {
                if (trigger.type === 'heavy_rain') {
                    await (0, triggerMonitoring_1.createTriggerEvent)(trigger.type, trigger.severity, zone, city, feeds.weather.source, trigger.rawValue, 'rainfall > 50mm/hour', `Heavy rainfall detected: ${trigger.rawValue}mm/hour`);
                    triggersCreated++;
                }
            }
        }
        // Process AQI data
        if (feeds.aqi) {
            const feedData = {
                aqi: feeds.aqi.aqiValue,
                timestamp: feeds.aqi.timestamp,
                zone,
                city,
                source: feeds.aqi.source
            };
            const triggers = (0, triggerMonitoring_1.evaluateTriggerThresholds)(feedData);
            for (const trigger of triggers) {
                if (trigger.type === 'hazardous_aqi') {
                    await (0, triggerMonitoring_1.createTriggerEvent)(trigger.type, trigger.severity, zone, city, feeds.aqi.source, trigger.rawValue, 'AQI > 200', `Poor air quality detected: AQI ${trigger.rawValue}`);
                    triggersCreated++;
                }
            }
        }
        // Process heat index data
        if (feeds.heatIndex) {
            const feedData = {
                heat_index_celsius: feeds.heatIndex.heatIndexCelsius,
                timestamp: feeds.heatIndex.timestamp,
                zone,
                city,
                source: feeds.heatIndex.source
            };
            const triggers = (0, triggerMonitoring_1.evaluateTriggerThresholds)(feedData);
            for (const trigger of triggers) {
                if (trigger.type === 'extreme_heat') {
                    await (0, triggerMonitoring_1.createTriggerEvent)(trigger.type, trigger.severity, zone, city, feeds.heatIndex.source, trigger.rawValue, 'Heat Index > 38°C', `Extreme heat detected: ${trigger.rawValue}°C`);
                    triggersCreated++;
                }
            }
        }
        // Process zone closure data
        if (feeds.zoneClosure) {
            const feedData = {
                access_restricted: feeds.zoneClosure.isClosed,
                closure_reason: feeds.zoneClosure.reason,
                timestamp: feeds.zoneClosure.timestamp,
                zone,
                city,
                source: feeds.zoneClosure.source
            };
            const triggers = (0, triggerMonitoring_1.evaluateTriggerThresholds)(feedData);
            for (const trigger of triggers) {
                if (trigger.type === 'zone_closure') {
                    await (0, triggerMonitoring_1.createTriggerEvent)(trigger.type, trigger.severity, zone, city, feeds.zoneClosure.source, trigger.rawValue, 'Zone access restricted', `Zone closure: ${feeds.zoneClosure.reason}`);
                    triggersCreated++;
                }
            }
        }
        // Process platform operations data
        if (feeds.platformOps) {
            const feedData = {
                order_volume_percent: feeds.platformOps.isOperational ? 100 : 0,
                timestamp: feeds.platformOps.timestamp,
                zone,
                city,
                source: feeds.platformOps.source
            };
            const triggers = (0, triggerMonitoring_1.evaluateTriggerThresholds)(feedData);
            for (const trigger of triggers) {
                if (trigger.type === 'platform_outage') {
                    await (0, triggerMonitoring_1.createTriggerEvent)(trigger.type, trigger.severity, zone, city, feeds.platformOps.source, trigger.rawValue, 'Order volume < 30%', `Platform disruption: ${feeds.platformOps.reason}`);
                    triggersCreated++;
                }
            }
        }
        logger_1.logger.debug({
            service: 'scheduled_monitor',
            operation: 'process_location_completed',
            message: 'Location processing completed',
            city,
            zone,
            triggersCreated
        });
        return triggersCreated;
    }
    catch (error) {
        logger_1.logger.error({
            service: 'scheduled_monitor',
            operation: 'process_location_error',
            message: `Location processing error: ${error.message}`,
            city,
            zone,
            error: error.message
        });
        return 0;
    }
}
/**
 * Manual trigger function for testing
 */
exports.manualTriggerMonitor = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can manually trigger monitoring');
    }
    const { city, zone } = data;
    if (!city || !zone) {
        throw new functions.https.HttpsError('invalid-argument', 'city and zone are required');
    }
    logger_1.logger.info({
        service: 'scheduled_monitor',
        operation: 'manual_trigger_started',
        message: 'Manual trigger started',
        city,
        zone,
        adminUid: context.auth.uid
    });
    try {
        const triggersCreated = await processLocation(city, zone);
        return {
            success: true,
            city,
            zone,
            triggersCreated
        };
    }
    catch (error) {
        logger_1.logger.error({
            service: 'scheduled_monitor',
            operation: 'manual_trigger_error',
            message: `Manual trigger error: ${error.message}`,
            city,
            zone,
            error: error.message
        });
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=scheduledMonitor.js.map