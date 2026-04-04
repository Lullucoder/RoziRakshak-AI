import { Claim, TriggerEvent, WorkerProfile, Policy } from '../types/claim';
import { Payout } from '../types/payout';

/**
 * Validate UPI ID format
 * Format: username@bankname (e.g., john@paytm, user123@ybl)
 */
export function validateUPIId(upiId: string): boolean {
  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
  return upiRegex.test(upiId);
}

/**
 * Validate phone number format (Indian)
 * Format: 10 digits, optionally starting with +91
 */
export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate zone ID format
 * Format: city_zonename (e.g., bangalore_koramangala, delhi_connaught_place)
 */
export function validateZoneId(zoneId: string): boolean {
  const zoneRegex = /^[a-z]+_[a-z_]+$/;
  return zoneRegex.test(zoneId);
}

/**
 * Validate city name
 */
export function validateCity(city: string): boolean {
  const allowedCities = [
    'bangalore', 'delhi', 'mumbai', 'hyderabad', 'chennai',
    'kolkata', 'pune', 'ahmedabad', 'jaipur', 'lucknow'
  ];
  return allowedCities.includes(city.toLowerCase());
}

/**
 * Validate claim document
 */
export function validateClaim(claim: Partial<Claim>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!claim.workerId) {
    errors.push('workerId is required');
  }
  
  if (!claim.policyId) {
    errors.push('policyId is required');
  }
  
  if (!claim.triggerEventId) {
    errors.push('triggerEventId is required');
  }
  
  if (!claim.triggerType) {
    errors.push('triggerType is required');
  }
  
  if (!claim.zone || !validateZoneId(claim.zone)) {
    errors.push('Invalid zone format');
  }
  
  if (!claim.city || !validateCity(claim.city)) {
    errors.push('Invalid city');
  }
  
  if (claim.payoutAmount !== undefined && (claim.payoutAmount < 0 || claim.payoutAmount > 10000)) {
    errors.push('Payout amount must be between 0 and 10000');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate payout document
 */
export function validatePayout(payout: Partial<Payout>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!payout.claimId) {
    errors.push('claimId is required');
  }
  
  if (!payout.workerId) {
    errors.push('workerId is required');
  }
  
  if (!payout.upiId || !validateUPIId(payout.upiId)) {
    errors.push('Invalid UPI ID format');
  }
  
  if (!payout.amount || payout.amount <= 0) {
    errors.push('Amount must be greater than 0');
  }
  
  if (payout.amount && payout.amount > 10000) {
    errors.push('Amount cannot exceed 10000');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate trigger event document
 */
export function validateTriggerEvent(event: Partial<TriggerEvent>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!event.type) {
    errors.push('type is required');
  }
  
  if (!event.severity) {
    errors.push('severity is required');
  }
  
  if (!event.zone || !validateZoneId(event.zone)) {
    errors.push('Invalid zone format');
  }
  
  if (!event.city || !validateCity(event.city)) {
    errors.push('Invalid city');
  }
  
  if (!event.sourceFeed) {
    errors.push('sourceFeed is required');
  }
  
  if (event.rawMeasurementValue === undefined) {
    errors.push('rawMeasurementValue is required');
  }
  
  if (event.thresholdApplied === undefined) {
    errors.push('thresholdApplied is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate worker profile
 */
export function validateWorkerProfile(worker: Partial<WorkerProfile>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!worker.name || worker.name.trim().length === 0) {
    errors.push('name is required');
  }
  
  if (!worker.phone || !validatePhoneNumber(worker.phone)) {
    errors.push('Invalid phone number format');
  }
  
  if (worker.email && !validateEmail(worker.email)) {
    errors.push('Invalid email format');
  }
  
  if (!worker.upiId || !validateUPIId(worker.upiId)) {
    errors.push('Invalid UPI ID format');
  }
  
  if (!worker.zone || !validateZoneId(worker.zone)) {
    errors.push('Invalid zone format');
  }
  
  if (!worker.city || !validateCity(worker.city)) {
    errors.push('Invalid city');
  }
  
  if (worker.trustScore !== undefined && (worker.trustScore < 0 || worker.trustScore > 1)) {
    errors.push('trustScore must be between 0 and 1');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate policy document
 */
export function validatePolicy(policy: Partial<Policy>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!policy.workerId) {
    errors.push('workerId is required');
  }
  
  if (!policy.tier || !['lite', 'core', 'peak'].includes(policy.tier)) {
    errors.push('Invalid tier (must be lite, core, or peak)');
  }
  
  if (!policy.premium || policy.premium <= 0) {
    errors.push('Premium must be greater than 0');
  }
  
  if (!policy.maxProtection || policy.maxProtection <= 0) {
    errors.push('maxProtection must be greater than 0');
  }
  
  if (!policy.zone || !validateZoneId(policy.zone)) {
    errors.push('Invalid zone format');
  }
  
  if (!policy.city || !validateCity(policy.city)) {
    errors.push('Invalid city');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize string input (remove special characters, trim)
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>\"']/g, '');
}

/**
 * Validate confidence score range
 */
export function validateConfidenceScore(score: number): boolean {
  return score >= 0 && score <= 1;
}

/**
 * Validate anomaly score range
 */
export function validateAnomalyScore(score: number): boolean {
  return score >= 0 && score <= 1;
}
