import { TriggerType, TriggerSeverity } from './claim';

/**
 * External Feed Data - Generic structure for all external data sources
 */
export interface ExternalFeedData {
  // Weather/Rainfall data
  rainfall_mm_per_hour?: number;
  duration_hours?: number;
  
  // AQI data
  aqi?: number;
  
  // Heat stress data
  heat_index_celsius?: number;
  temperature_celsius?: number;
  humidity_percent?: number;
  
  // Zone closure data
  access_restricted?: boolean;
  closure_reason?: string;
  
  // Platform operations data
  order_volume_percent?: number;
  
  // Common fields
  timestamp: Date;
  zone: string;
  city: string;
  source: string;
}

/**
 * Trigger Threshold Configuration
 */
export interface TriggerThreshold {
  type: TriggerType;
  condition: (data: ExternalFeedData) => boolean;
  severity: (data: ExternalFeedData) => TriggerSeverity;
  description: string;
}

/**
 * Weather API Response (OpenWeatherMap or similar)
 */
export interface WeatherAPIResponse {
  coord: {
    lon: number;
    lat: number;
  };
  weather: Array<{
    id: number;
    main: string;
    description: string;
  }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
  };
  rain?: {
    '1h'?: number;  // Rainfall in last 1 hour (mm)
    '3h'?: number;  // Rainfall in last 3 hours (mm)
  };
  dt: number;       // Unix timestamp
  name: string;     // City name
}

/**
 * AQI API Response
 */
export interface AQIAPIResponse {
  city: string;
  state: string;
  country: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  current: {
    pollution: {
      ts: string;
      aqius: number;  // US AQI value
      mainus: string; // Main pollutant (US)
      aqicn: number;  // China AQI value
      maincn: string; // Main pollutant (China)
    };
    weather: {
      ts: string;
      tp: number;     // Temperature
      pr: number;     // Pressure
      hu: number;     // Humidity
      ws: number;     // Wind speed
    };
  };
}

/**
 * Heat Index Calculation Result
 */
export interface HeatIndexData {
  temperature_celsius: number;
  humidity_percent: number;
  heat_index_celsius: number;
  heat_index_fahrenheit: number;
  risk_level: 'safe' | 'caution' | 'extreme_caution' | 'danger' | 'extreme_danger';
  timestamp: Date;
}

/**
 * Zone Closure Feed Data
 */
export interface ZoneClosureData {
  zone_id: string;
  city: string;
  closure_type: 'full' | 'partial' | 'restricted';
  reason: string;
  start_time: Date;
  end_time: Date | null;
  affected_areas: string[];
  source: string;
}

/**
 * Platform Operations Feed Data
 */
export interface PlatformOpsData {
  platform: string;
  zone_id: string;
  city: string;
  order_volume_current: number;
  order_volume_baseline: number;
  order_volume_percent: number;
  active_riders: number;
  timestamp: Date;
}
