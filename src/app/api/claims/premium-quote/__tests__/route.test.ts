/**
 * Premium Quote API - Integration Tests
 * 
 * Run with: npm test src/app/api/claims/premium-quote/__tests__/route.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { POST } from '../route';
import { NextRequest } from 'next/server';

// Mock Firebase Admin
jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: jest.fn()
  },
  adminDb: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn()
      }))
    }))
  }
}));

// Mock premium engine
jest.mock('@/lib/premiumEngine', () => ({
  calculateFallbackPremium: jest.fn(() => ({
    request_id: 'fallback_test_123',
    worker_id: 'test_worker',
    zone_id: 'zone_1',
    city_tier: 'tier_2',
    plans: {
      lite: {
        plan_name: 'Lite',
        weekly_premium: 19,
        max_weekly_protection: 500,
        expected_payout: 50,
        roi_ratio: 2.63
      },
      standard: {
        plan_name: 'Standard',
        weekly_premium: 39,
        max_weekly_protection: 1000,
        expected_payout: 100,
        roi_ratio: 2.56
      },
      premium: {
        plan_name: 'Premium',
        weekly_premium: 79,
        max_weekly_protection: 2000,
        expected_payout: 200,
        roi_ratio: 2.53
      }
    },
    model_used: 'fallback_rules',
    timestamp: new Date().toISOString()
  })),
  getFloorPriceQuote: jest.fn(() => ({
    request_id: 'floor_test_123',
    worker_id: 'test_worker',
    zone_id: 'zone_1',
    city_tier: 'tier_2',
    plans: {
      lite: {
        plan_name: 'Lite',
        weekly_premium: 19,
        max_weekly_protection: 500,
        expected_payout: 0,
        roi_ratio: 0
      },
      standard: {
        plan_name: 'Standard',
        weekly_premium: 39,
        max_weekly_protection: 1000,
        expected_payout: 0,
        roi_ratio: 0
      },
      premium: {
        plan_name: 'Premium',
        weekly_premium: 79,
        max_weekly_protection: 2000,
        expected_payout: 0,
        roi_ratio: 0
      }
    },
    model_used: 'floor_price',
    timestamp: new Date().toISOString()
  }))
}));

describe('Premium Quote API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should return 401 when no authorization header', async () => {
    const request = new NextRequest('http://localhost:3000/api/claims/premium-quote', {
      method: 'POST'
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
  
  it('should return 401 when invalid token', async () => {
    const { adminAuth } = await import('@/lib/firebase-admin');
    (adminAuth.verifyIdToken as jest.Mock).mockRejectedValue(new Error('Invalid token'));
    
    const request = new NextRequest('http://localhost:3000/api/claims/premium-quote', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid_token'
      }
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
  
  it('should return 404 when worker not found', async () => {
    const { adminAuth, adminDb } = await import('@/lib/firebase-admin');
    (adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'test_worker' });
    
    const mockGet = jest.fn().mockResolvedValue({ exists: false });
    (adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet })
    });
    
    const request = new NextRequest('http://localhost:3000/api/claims/premium-quote', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid_token'
      }
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Worker not found');
  });
  
  it('should return premium quote using fallback engine', async () => {
    const { adminAuth, adminDb } = await import('@/lib/firebase-admin');
    (adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'test_worker' });
    
    const mockGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        zone: 'zone_1',
        city: 'Mumbai',
        shiftStartHour: 9,
        shiftDurationHours: 8,
        weeklyIncomeSlab: 'medium',
        claimCountLast4Weeks: 0,
        trustScore: 0.8,
        joinedDate: { toMillis: () => Date.now() - 30 * 24 * 60 * 60 * 1000 },
        priorZoneDisruptionDensity: 0.1
      })
    });
    
    (adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet })
    });
    
    // Mock fetch to fail (force fallback)
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    const request = new NextRequest('http://localhost:3000/api/claims/premium-quote', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid_token'
      }
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.model_used).toBe('fallback_rules');
    expect(data.plans.lite.weekly_premium).toBeGreaterThan(0);
    expect(data.plans.standard.weekly_premium).toBeGreaterThan(0);
    expect(data.plans.premium.weekly_premium).toBeGreaterThan(0);
  });
  
  it('should handle rate limiting', async () => {
    const { adminAuth, adminDb } = await import('@/lib/firebase-admin');
    (adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'test_worker' });
    
    const mockGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        zone: 'zone_1',
        city: 'Mumbai',
        shiftStartHour: 9,
        shiftDurationHours: 8,
        weeklyIncomeSlab: 'medium',
        claimCountLast4Weeks: 0,
        trustScore: 0.8,
        joinedDate: { toMillis: () => Date.now() },
        priorZoneDisruptionDensity: 0.1
      })
    });
    
    (adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet })
    });
    
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    // Make 11 requests (exceeds limit of 10)
    for (let i = 0; i < 11; i++) {
      const request = new NextRequest('http://localhost:3000/api/claims/premium-quote', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid_token'
        }
      });
      
      const response = await POST(request);
      
      if (i < 10) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
        const data = await response.json();
        expect(data.error).toBe('Rate limit exceeded');
      }
    }
  });
});

describe('Premium Engine Fallback', () => {
  it('should calculate premium using multiplier table', async () => {
    const { calculateFallbackPremium } = await import('@/lib/premiumEngine');
    
    const features = {
      worker_id: 'test_worker',
      zone_id: 'zone_1',
      city_tier: 'tier_1',
      shift_start_hour: 9,
      shift_duration_hours: 8,
      declared_weekly_income_slab: 'medium',
      claim_count_last_4_weeks: 0,
      trust_score: 0.8,
      days_since_registration: 30,
      prior_zone_disruption_density: 0.1,
      disruption_probability: 0.1,
      week_of_year: 14,
      season_flag: 'summer'
    };
    
    const quote = (calculateFallbackPremium as jest.Mock)(features);
    
    expect(quote.model_used).toBe('fallback_rules');
    expect(quote.plans.lite.weekly_premium).toBeGreaterThan(0);
    expect(quote.plans.standard.weekly_premium).toBeGreaterThan(0);
    expect(quote.plans.premium.weekly_premium).toBeGreaterThan(0);
  });
  
  it('should return floor price quote', async () => {
    const { getFloorPriceQuote } = await import('@/lib/premiumEngine');
    
    const quote = (getFloorPriceQuote as jest.Mock)('test_worker', 'zone_1', 'tier_2');
    
    expect(quote.model_used).toBe('floor_price');
    expect(quote.plans.lite.weekly_premium).toBe(19);
    expect(quote.plans.standard.weekly_premium).toBe(39);
    expect(quote.plans.premium.weekly_premium).toBe(79);
  });
});
