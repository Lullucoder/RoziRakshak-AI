/**
 * Scheduled Trigger Monitor
 * 
 * Cloud Function that runs every 15 minutes to:
 * 1. Poll all external feeds for monitored cities/zones
 * 2. Evaluate trigger thresholds
 * 3. Create TriggerEvent documents when thresholds are exceeded
 */

import * as functions from 'firebase-functions';
import { logger } from '../utils/logger';
import { fetchAllFeeds } from './externalFeeds';
import { evaluateTriggerThresholds, createTriggerEvent } from './triggerMonitoring';
import { ExternalFeedData } from '../types/trigger';

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
export const monitorTriggers = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    logger.info({
      service: 'scheduled_monitor',
      operation: 'monitor_triggers_started',
      message: 'Starting trigger monitoring',
      executionId: context.eventId,
      timestamp: context.timestamp
    });

    const startTime = Date.now();
    let totalTriggersCreated = 0;
    const errors: string[] = [];

    try {
      const locationPromises = MONITORED_LOCATIONS.flatMap(location =>
        location.zones.map(zone => processLocation(location.city, zone))
      );

      const results = await Promise.allSettled(locationPromises);

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          totalTriggersCreated += result.value;
        } else {
          errors.push(`Location ${index}: ${result.reason}`);
          logger.error({
            service: 'scheduled_monitor',
            operation: 'location_processing_failed',
            message: `Location processing failed: ${result.reason}`,
            index
          });
        }
      });

      const duration = Date.now() - startTime;

      logger.info({
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
    } catch (error: any) {
      logger.error({
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
async function processLocation(city: string, zone: string): Promise<number> {
  logger.debug({
    service: 'scheduled_monitor',
    operation: 'process_location_started',
    message: 'Processing location',
    city,
    zone
  });

  try {
    const feeds = await fetchAllFeeds(city, zone);
    let triggersCreated = 0;

    // Process weather data (rainfall)
    if (feeds.weather) {
      const feedData: ExternalFeedData = {
        rainfall_mm_per_hour: feeds.weather.rainfallMm,
        timestamp: feeds.weather.timestamp,
        zone,
        city,
        source: feeds.weather.source
      };

      const triggers = evaluateTriggerThresholds(feedData);
      
      for (const trigger of triggers) {
        if (trigger.type === 'heavy_rain') {
          await createTriggerEvent(
            trigger.type,
            trigger.severity,
            zone,
            city,
            feeds.weather.source,
            trigger.rawValue,
            'rainfall > 50mm/hour',
            `Heavy rainfall detected: ${trigger.rawValue}mm/hour`
          );
          triggersCreated++;
        }
      }
    }

    // Process AQI data
    if (feeds.aqi) {
      const feedData: ExternalFeedData = {
        aqi: feeds.aqi.aqiValue,
        timestamp: feeds.aqi.timestamp,
        zone,
        city,
        source: feeds.aqi.source
      };

      const triggers = evaluateTriggerThresholds(feedData);
      
      for (const trigger of triggers) {
        if (trigger.type === 'hazardous_aqi') {
          await createTriggerEvent(
            trigger.type,
            trigger.severity,
            zone,
            city,
            feeds.aqi.source,
            trigger.rawValue,
            'AQI > 200',
            `Poor air quality detected: AQI ${trigger.rawValue}`
          );
          triggersCreated++;
        }
      }
    }

    // Process heat index data
    if (feeds.heatIndex) {
      const feedData: ExternalFeedData = {
        heat_index_celsius: feeds.heatIndex.heatIndexCelsius,
        timestamp: feeds.heatIndex.timestamp,
        zone,
        city,
        source: feeds.heatIndex.source
      };

      const triggers = evaluateTriggerThresholds(feedData);
      
      for (const trigger of triggers) {
        if (trigger.type === 'extreme_heat') {
          await createTriggerEvent(
            trigger.type,
            trigger.severity,
            zone,
            city,
            feeds.heatIndex.source,
            trigger.rawValue,
            'Heat Index > 38°C',
            `Extreme heat detected: ${trigger.rawValue}°C`
          );
          triggersCreated++;
        }
      }
    }

    // Process zone closure data
    if (feeds.zoneClosure) {
      const feedData: ExternalFeedData = {
        access_restricted: feeds.zoneClosure.isClosed,
        closure_reason: feeds.zoneClosure.reason,
        timestamp: feeds.zoneClosure.timestamp,
        zone,
        city,
        source: feeds.zoneClosure.source
      };

      const triggers = evaluateTriggerThresholds(feedData);
      
      for (const trigger of triggers) {
        if (trigger.type === 'zone_closure') {
          await createTriggerEvent(
            trigger.type,
            trigger.severity,
            zone,
            city,
            feeds.zoneClosure.source,
            trigger.rawValue,
            'Zone access restricted',
            `Zone closure: ${feeds.zoneClosure.reason}`
          );
          triggersCreated++;
        }
      }
    }

    // Process platform operations data
    if (feeds.platformOps) {
      const feedData: ExternalFeedData = {
        order_volume_percent: feeds.platformOps.isOperational ? 100 : 0,
        timestamp: feeds.platformOps.timestamp,
        zone,
        city,
        source: feeds.platformOps.source
      };

      const triggers = evaluateTriggerThresholds(feedData);
      
      for (const trigger of triggers) {
        if (trigger.type === 'platform_outage') {
          await createTriggerEvent(
            trigger.type,
            trigger.severity,
            zone,
            city,
            feeds.platformOps.source,
            trigger.rawValue,
            'Order volume < 30%',
            `Platform disruption: ${feeds.platformOps.reason}`
          );
          triggersCreated++;
        }
      }
    }

    logger.debug({
      service: 'scheduled_monitor',
      operation: 'process_location_completed',
      message: 'Location processing completed',
      city,
      zone,
      triggersCreated
    });

    return triggersCreated;
  } catch (error: any) {
    logger.error({
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
export const manualTriggerMonitor = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can manually trigger monitoring'
    );
  }

  const { city, zone } = data;

  if (!city || !zone) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'city and zone are required'
    );
  }

  logger.info({
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
  } catch (error: any) {
    logger.error({
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
