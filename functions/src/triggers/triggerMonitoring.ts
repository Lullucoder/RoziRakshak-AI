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

import * as admin from 'firebase-admin';
import { TriggerType, TriggerSeverity } from '../types/claim';
import { ExternalFeedData, TriggerThreshold } from '../types/trigger';
import * as logger from '../utils/logger';
import { createDocument } from '../utils/firestore';

/**
 * Trigger Threshold Definitions
 * Each threshold defines when a trigger event should be created
 */
export const TRIGGER_THRESHOLDS: TriggerThreshold[] = [
  // 1. Heavy Rainfall
  {
    type: 'heavy_rain',
    condition: (data: ExternalFeedData) => {
      return (data.rainfall_mm_per_hour || 0) > 0;
    },
    severity: (data: ExternalFeedData) => {
      const rainfall = data.rainfall_mm_per_hour || 0;
      if (rainfall >= 100) return 'severe';
      if (rainfall >= 50) return 'high';
      return 'moderate';
    },
    description: 'Heavy rainfall detected'
  },
  
  // 2. Poor Air Quality
  {
    type: 'hazardous_aqi',
    condition: (data: ExternalFeedData) => {
      return (data.aqi || 0) > 200;
    },
    severity: (data: ExternalFeedData) => {
      const aqi = data.aqi || 0;
      if (aqi >= 400) return 'severe';
      if (aqi >= 300) return 'high';
      return 'moderate';
    },
    description: 'Poor air quality detected'
  },
  
  // 3. Extreme Heat
  {
    type: 'extreme_heat',
    condition: (data: ExternalFeedData) => {
      return (data.heat_index_celsius || 0) > 38;
    },
    severity: (data: ExternalFeedData) => {
      const heatIndex = data.heat_index_celsius || 0;
      if (heatIndex >= 45) return 'severe';
      if (heatIndex >= 42) return 'high';
      return 'moderate';
    },
    description: 'Extreme heat detected'
  },
  
  // 4. Zone Closure
  {
    type: 'zone_closure',
    condition: (data: ExternalFeedData) => {
      return data.access_restricted === true;
    },
    severity: (data: ExternalFeedData) => {
      // Zone closures are always high severity
      return 'high';
    },
    description: 'Zone access restricted'
  },
  
  // 5. Platform Disruption
  {
    type: 'platform_outage',
    condition: (data: ExternalFeedData) => {
      return (data.order_volume_percent || 100) < 30;
    },
    severity: (data: ExternalFeedData) => {
      const volumePercent = data.order_volume_percent || 100;
      if (volumePercent < 10) return 'severe';
      if (volumePercent < 20) return 'high';
      return 'moderate';
    },
    description: 'Platform order volume disruption'
  }
];

/**
 * Evaluate all trigger thresholds against external feed data
 * Returns array of triggered events
 */
export function evaluateTriggerThresholds(data: ExternalFeedData): Array<{
  type: TriggerType;
  severity: TriggerSeverity;
  description: string;
  rawValue: number | boolean;
}> {
  const triggeredEvents: Array<{
    type: TriggerType;
    severity: TriggerSeverity;
    description: string;
    rawValue: number | boolean;
  }> = [];

  for (const threshold of TRIGGER_THRESHOLDS) {
    if (threshold.condition(data)) {
      const severity = threshold.severity(data);
      
      // Extract raw measurement value based on trigger type
      let rawValue: number | boolean = 0;
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
export function calculateTriggerSeverity(
  type: TriggerType,
  measurementValue: number,
  durationHours?: number
): TriggerSeverity {
  switch (type) {
    case 'heavy_rain':
      if (measurementValue >= 100) return 'severe';
      if (measurementValue >= 50) return 'high';
      return 'moderate';
      
    case 'hazardous_aqi':
      if (measurementValue >= 400) return 'severe';
      if (measurementValue >= 300) return 'high';
      return 'moderate';
      
    case 'extreme_heat':
      if (measurementValue >= 45) return 'severe';
      if (measurementValue >= 42) return 'high';
      return 'moderate';
      
    case 'zone_closure':
      // Zone closures are always high severity
      return 'high';
      
    case 'platform_outage':
      if (measurementValue < 10) return 'severe';
      if (measurementValue < 20) return 'high';
      return 'moderate';
      
    default:
      return 'moderate';
  }
}

/**
 * Create a TriggerEvent document in Firestore
 */
export async function createTriggerEvent(
  type: TriggerType,
  severity: TriggerSeverity,
  zone: string,
  city: string,
  sourceFeed: string,
  rawMeasurementValue: number | boolean,
  thresholdApplied: string,
  description: string
): Promise<string> {
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

    const docRef = await createDocument('triggerEvents', triggerEventData);
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
  } catch (error: any) {
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
async function calculateAffectedWorkersCount(zone: string, city: string): Promise<number> {
  const db = admin.firestore();
  
  try {
    // Query active policies in the zone
    const policiesSnapshot = await db.collection('policies')
      .where('zone', '==', zone)
      .where('city', '==', city)
      .where('status', '==', 'active')
      .get();

    return policiesSnapshot.size;
  } catch (error: any) {
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
export async function endTriggerEvent(triggerEventId: string): Promise<void> {
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
  } catch (error: any) {
    logger.error({
      service: 'trigger_monitoring',
      operation: 'end_trigger_event_error',
      message: `Failed to end trigger event: ${error.message}`,
      triggerEventId,
      error: error.message
    });
  }
}
