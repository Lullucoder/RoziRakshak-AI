"use strict";
/**
 * External Feed Integrations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWeatherData = fetchWeatherData;
exports.fetchAQIData = fetchAQIData;
exports.fetchHeatIndexData = fetchHeatIndexData;
exports.fetchZoneClosureData = fetchZoneClosureData;
exports.fetchPlatformOpsData = fetchPlatformOpsData;
exports.fetchAllFeeds = fetchAllFeeds;
const logger_1 = require("../utils/logger");
const WEATHER_API_URL = process.env.WEATHER_API_URL || 'https://api.openweathermap.org/data/2.5/weather';
const AQI_API_URL = process.env.AQI_API_URL || 'https://api.waqi.info/feed';
const HEAT_INDEX_API_URL = process.env.HEAT_INDEX_API_URL || 'https://api.weatherapi.com/v1/current.json';
const ZONE_CLOSURE_API_URL = process.env.ZONE_CLOSURE_API_URL || 'https://api.example.com/zone-closures';
const PLATFORM_OPS_API_URL = process.env.PLATFORM_OPS_API_URL || 'https://api.example.com/platform-ops';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '';
const AQI_API_KEY = process.env.AQI_API_KEY || '';
const HEAT_INDEX_API_KEY = process.env.HEAT_INDEX_API_KEY || '';
async function fetchWeatherData(city, zone) {
    var _a;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        logger_1.logger.debug({
            service: 'external_feeds',
            operation: 'fetch_weather',
            message: 'Fetching weather data',
            city,
            zone
        });
        const response = await fetch(`${WEATHER_API_URL}?q=${city}&appid=${WEATHER_API_KEY}&units=metric`, { signal: controller.signal });
        if (!response.ok) {
            logger_1.logger.warn({
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
        const rainfallMm = ((_a = data.rain) === null || _a === void 0 ? void 0 : _a['1h']) || 0;
        return {
            city,
            zone,
            rainfallMm,
            timestamp: new Date(),
            source: 'openweathermap'
        };
    }
    catch (error) {
        if (error.name === 'AbortError') {
            logger_1.logger.warn({
                service: 'external_feeds',
                operation: 'fetch_weather_timeout',
                message: 'Weather API request timed out',
                city,
                zone
            });
        }
        else {
            logger_1.logger.error({
                service: 'external_feeds',
                operation: 'fetch_weather_error',
                message: `Weather API error: ${error.message}`,
                city,
                zone
            });
        }
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function fetchAQIData(city, zone) {
    var _a;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        logger_1.logger.debug({
            service: 'external_feeds',
            operation: 'fetch_aqi',
            message: 'Fetching AQI data',
            city,
            zone
        });
        const response = await fetch(`${AQI_API_URL}/${city}/?token=${AQI_API_KEY}`, { signal: controller.signal });
        if (!response.ok) {
            logger_1.logger.warn({
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
            logger_1.logger.warn({
                service: 'external_feeds',
                operation: 'fetch_aqi_invalid',
                message: 'AQI API returned invalid status',
                city,
                zone,
                status: data.status
            });
            return null;
        }
        const aqiValue = ((_a = data.data) === null || _a === void 0 ? void 0 : _a.aqi) || 0;
        return {
            city,
            zone,
            aqiValue,
            timestamp: new Date(),
            source: 'waqi'
        };
    }
    catch (error) {
        if (error.name === 'AbortError') {
            logger_1.logger.warn({
                service: 'external_feeds',
                operation: 'fetch_aqi_timeout',
                message: 'AQI API request timed out',
                city,
                zone
            });
        }
        else {
            logger_1.logger.error({
                service: 'external_feeds',
                operation: 'fetch_aqi_error',
                message: `AQI API error: ${error.message}`,
                city,
                zone
            });
        }
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function fetchHeatIndexData(city, zone) {
    var _a, _b;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        logger_1.logger.debug({
            service: 'external_feeds',
            operation: 'fetch_heat_index',
            message: 'Fetching heat index data',
            city,
            zone
        });
        const response = await fetch(`${HEAT_INDEX_API_URL}?key=${HEAT_INDEX_API_KEY}&q=${city}&aqi=no`, { signal: controller.signal });
        if (!response.ok) {
            logger_1.logger.warn({
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
        const feelsLikeC = ((_a = data.current) === null || _a === void 0 ? void 0 : _a.feelslike_c) || ((_b = data.current) === null || _b === void 0 ? void 0 : _b.temp_c) || 0;
        return {
            city,
            zone,
            heatIndexCelsius: feelsLikeC,
            timestamp: new Date(),
            source: 'weatherapi'
        };
    }
    catch (error) {
        if (error.name === 'AbortError') {
            logger_1.logger.warn({
                service: 'external_feeds',
                operation: 'fetch_heat_index_timeout',
                message: 'Heat index API request timed out',
                city,
                zone
            });
        }
        else {
            logger_1.logger.error({
                service: 'external_feeds',
                operation: 'fetch_heat_index_error',
                message: `Heat index API error: ${error.message}`,
                city,
                zone
            });
        }
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function fetchZoneClosureData(city, zone) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        logger_1.logger.debug({
            service: 'external_feeds',
            operation: 'fetch_zone_closure',
            message: 'Fetching zone closure data',
            city,
            zone
        });
        const response = await fetch(`${ZONE_CLOSURE_API_URL}?city=${city}&zone=${zone}`, { signal: controller.signal });
        if (!response.ok) {
            logger_1.logger.warn({
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
    }
    catch (error) {
        if (error.name === 'AbortError') {
            logger_1.logger.warn({
                service: 'external_feeds',
                operation: 'fetch_zone_closure_timeout',
                message: 'Zone closure API request timed out',
                city,
                zone
            });
        }
        else {
            logger_1.logger.error({
                service: 'external_feeds',
                operation: 'fetch_zone_closure_error',
                message: `Zone closure API error: ${error.message}`,
                city,
                zone
            });
        }
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function fetchPlatformOpsData(city, zone) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        logger_1.logger.debug({
            service: 'external_feeds',
            operation: 'fetch_platform_ops',
            message: 'Fetching platform ops data',
            city,
            zone
        });
        const response = await fetch(`${PLATFORM_OPS_API_URL}?city=${city}&zone=${zone}`, { signal: controller.signal });
        if (!response.ok) {
            logger_1.logger.warn({
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
    }
    catch (error) {
        if (error.name === 'AbortError') {
            logger_1.logger.warn({
                service: 'external_feeds',
                operation: 'fetch_platform_ops_timeout',
                message: 'Platform ops API request timed out',
                city,
                zone
            });
        }
        else {
            logger_1.logger.error({
                service: 'external_feeds',
                operation: 'fetch_platform_ops_error',
                message: `Platform ops API error: ${error.message}`,
                city,
                zone
            });
        }
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function fetchAllFeeds(city, zone) {
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
//# sourceMappingURL=externalFeeds.js.map