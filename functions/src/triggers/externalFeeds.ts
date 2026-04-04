/**
 * External Feed Integrations
 */

import { logger } from '../utils/logger';

const WEATHER_API_URL = process.env.WEATHER_API_URL || 'https://api.openweathermap.org/data/2.5/weather';
const AQI_API_URL = process.env.AQI_API_URL || 'https://api.waqi.info/feed';
const HEAT_INDEX_API_URL = process.env.HEAT_INDEX_API_URL || 'https://api.weatherapi.com/v1/current.json';
const ZONE_CLOSURE_API_URL = process.env.ZONE_CLOSURE_API_URL || 'https://api.example.com/zone-closures';
const PLATFORM_OPS_API_URL = process.env.PLATFORM_OPS_API_URL || 'https://api.example.com/platform-ops';

const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '';
const AQI_API_KEY = process.env.AQI_API_KEY || '';
const HEAT_INDEX_API_KEY = process.env.HEAT_INDEX_API_KEY || '';

export interface WeatherData {
  city: string;
  zone: string;
  rainfallMm: number;
  timestamp: Date;
  source: string;
}

export interface AQIData {
  city: string;
  zone: string;
  aqiValue: number;
  timestamp: Date;
  source: string;
}

export interface HeatIndexData {
  city: string;
  zone: string;
  heatIndexCelsius: number;
  timestamp: Date;
  source: string;
}

export interface ZoneClosureData {
  city: string;
  zone: string;
  isClosed: boolean;
  reason: string;
  timestamp: Date;
  source: string;
}

export interface PlatformOpsData {
  city: string;
  zone: string;
  isOperational: boolean;
  reason: string;
  timestamp: Date;
  source: string;
}

export async function fetchWeatherData(city: string, zone: string): Promise<WeatherData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    logger.debug({
      service: 'external_feeds',
      operation: 'fetch_weather',
      message: 'Fetching weather data',
      city,
      zone
    });

    const response = await fetch(
      `${WEATHER_API_URL}?q=${city}&appid=${WEATHER_API_KEY}&units=metric`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_weather_failed',
        message: 'Weather API request failed',
        city,
        zone,
        status: response.status
      });
      return null;
    }

    const data = await response.json();
    const rainfallMm = data.rain?.['1h'] || 0;

    return {
      city,
      zone,
      rainfallMm,
      timestamp: new Date(),
      source: 'openweathermap'
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_weather_timeout',
        message: 'Weather API request timed out',
        city,
        zone
      });
    } else {
      logger.error({
        service: 'external_feeds',
        operation: 'fetch_weather_error',
        message: `Weather API error: ${error.message}`,
        city,
        zone
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAQIData(city: string, zone: string): Promise<AQIData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    logger.debug({
      service: 'external_feeds',
      operation: 'fetch_aqi',
      message: 'Fetching AQI data',
      city,
      zone
    });

    const response = await fetch(
      `${AQI_API_URL}/${city}/?token=${AQI_API_KEY}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_aqi_failed',
        message: 'AQI API request failed',
        city,
        zone,
        status: response.status
      });
      return null;
    }

    const data = await response.json();
    
    if (data.status !== 'ok') {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_aqi_invalid',
        message: 'AQI API returned invalid status',
        city,
        zone,
        status: data.status
      });
      return null;
    }

    const aqiValue = data.data?.aqi || 0;

    return {
      city,
      zone,
      aqiValue,
      timestamp: new Date(),
      source: 'waqi'
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_aqi_timeout',
        message: 'AQI API request timed out',
        city,
        zone
      });
    } else {
      logger.error({
        service: 'external_feeds',
        operation: 'fetch_aqi_error',
        message: `AQI API error: ${error.message}`,
        city,
        zone
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchHeatIndexData(city: string, zone: string): Promise<HeatIndexData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    logger.debug({
      service: 'external_feeds',
      operation: 'fetch_heat_index',
      message: 'Fetching heat index data',
      city,
      zone
    });

    const response = await fetch(
      `${HEAT_INDEX_API_URL}?key=${HEAT_INDEX_API_KEY}&q=${city}&aqi=no`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_heat_index_failed',
        message: 'Heat index API request failed',
        city,
        zone,
        status: response.status
      });
      return null;
    }

    const data = await response.json();
    const feelsLikeC = data.current?.feelslike_c || data.current?.temp_c || 0;

    return {
      city,
      zone,
      heatIndexCelsius: feelsLikeC,
      timestamp: new Date(),
      source: 'weatherapi'
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_heat_index_timeout',
        message: 'Heat index API request timed out',
        city,
        zone
      });
    } else {
      logger.error({
        service: 'external_feeds',
        operation: 'fetch_heat_index_error',
        message: `Heat index API error: ${error.message}`,
        city,
        zone
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchZoneClosureData(city: string, zone: string): Promise<ZoneClosureData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    logger.debug({
      service: 'external_feeds',
      operation: 'fetch_zone_closure',
      message: 'Fetching zone closure data',
      city,
      zone
    });

    const response = await fetch(
      `${ZONE_CLOSURE_API_URL}?city=${city}&zone=${zone}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_zone_closure_failed',
        message: 'Zone closure API request failed',
        city,
        zone,
        status: response.status
      });
      return null;
    }

    const data = await response.json();

    return {
      city,
      zone,
      isClosed: data.is_closed || false,
      reason: data.reason || '',
      timestamp: new Date(),
      source: 'zone_closure_feed'
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_zone_closure_timeout',
        message: 'Zone closure API request timed out',
        city,
        zone
      });
    } else {
      logger.error({
        service: 'external_feeds',
        operation: 'fetch_zone_closure_error',
        message: `Zone closure API error: ${error.message}`,
        city,
        zone
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchPlatformOpsData(city: string, zone: string): Promise<PlatformOpsData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    logger.debug({
      service: 'external_feeds',
      operation: 'fetch_platform_ops',
      message: 'Fetching platform ops data',
      city,
      zone
    });

    const response = await fetch(
      `${PLATFORM_OPS_API_URL}?city=${city}&zone=${zone}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_platform_ops_failed',
        message: 'Platform ops API request failed',
        city,
        zone,
        status: response.status
      });
      return null;
    }

    const data = await response.json();

    return {
      city,
      zone,
      isOperational: data.is_operational !== false,
      reason: data.reason || '',
      timestamp: new Date(),
      source: 'platform_ops_feed'
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn({
        service: 'external_feeds',
        operation: 'fetch_platform_ops_timeout',
        message: 'Platform ops API request timed out',
        city,
        zone
      });
    } else {
      logger.error({
        service: 'external_feeds',
        operation: 'fetch_platform_ops_error',
        message: `Platform ops API error: ${error.message}`,
        city,
        zone
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAllFeeds(city: string, zone: string) {
  const [weather, aqi, heatIndex, zoneClosure, platformOps] = await Promise.all([
    fetchWeatherData(city, zone),
    fetchAQIData(city, zone),
    fetchHeatIndexData(city, zone),
    fetchZoneClosureData(city, zone),
    fetchPlatformOpsData(city, zone)
  ]);

  return {
    weather,
    aqi,
    heatIndex,
    zoneClosure,
    platformOps
  };
}
