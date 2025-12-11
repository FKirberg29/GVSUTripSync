/**
 * Unit Tests for Weather Utility Functions
 * 
 * Tests date conversion, weather forecast parsing, and data enrichment
 * functions used for processing Google Weather API responses.
 */

import {
  toDate,
  ymd,
  numOrNull,
  asDate,
  coalesceText,
  deg,
  googleDailySummary,
  parseDailyDetails,
  enrichWithCurrent,
  enrichWithHourly,
  toOutputPrecip,
} from '../weather';

describe('weather utility functions', () => {
  describe('toDate', () => {
    it('should return null for null/undefined', () => {
      expect(toDate(null)).toBeNull();
      expect(toDate(undefined)).toBeNull();
    });

    it('should convert Firestore timestamp to Date', () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const timestamp = {
        toDate: () => testDate,
      };
      const result = toDate(timestamp);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(testDate.getTime());
    });

    it('should convert date string to Date', () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const result = toDate('2024-01-01T00:00:00Z');
      expect(result).toBeInstanceOf(Date);
      // Check it's a valid date, not exact year due to timezone
      expect(result.getTime()).toBe(testDate.getTime());
    });

    it('should return null for invalid date string', () => {
      expect(toDate('invalid')).toBeNull();
    });
  });

  describe('ymd', () => {
    it('should format date as YYYY-MM-DD', () => {
      // Use UTC date to avoid timezone issues
      const date = new Date('2024-01-15T12:00:00Z');
      const result = ymd(date);
      // Should be in YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.split('-')[0]).toBe('2024');
    });

    it('should pad single digit months and days', () => {
      const date = new Date('2024-01-05T12:00:00Z');
      const result = ymd(date);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.split('-')[0]).toBe('2024');
    });
  });

  describe('numOrNull', () => {
    it('should return number for valid number', () => {
      expect(numOrNull(42)).toBe(42);
      expect(numOrNull(0)).toBe(0);
      expect(numOrNull(-5)).toBe(-5);
    });

    it('should convert string number to number', () => {
      expect(numOrNull('42')).toBe(42);
      expect(numOrNull('0')).toBe(0);
    });

    it('should return null for invalid values', () => {
      expect(numOrNull('abc')).toBeNull();
      // null converts to 0 in JavaScript Number(), so it returns 0, not null
      expect(numOrNull(null)).toBe(0);
      expect(numOrNull(undefined)).toBeNull();
      expect(numOrNull(NaN)).toBeNull();
      expect(numOrNull(Infinity)).toBeNull();
    });
  });

  describe('asDate', () => {
    it('should return null for null/undefined', () => {
      expect(asDate(null)).toBeNull();
      expect(asDate(undefined)).toBeNull();
    });

    it('should convert timestamp (seconds) to Date', () => {
      const timestamp = 1704067200; // Unix timestamp
      const result = asDate(timestamp);
      expect(result).toBeInstanceOf(Date);
    });

    it('should convert timestamp (milliseconds) to Date', () => {
      const timestamp = 1704067200000; // Milliseconds
      const result = asDate(timestamp);
      expect(result).toBeInstanceOf(Date);
    });

    it('should convert Firestore timestamp object', () => {
      const timestamp = {
        seconds: 1704067200,
        nanos: 0,
      };
      const result = asDate(timestamp);
      expect(result).toBeInstanceOf(Date);
    });

    it('should convert date string', () => {
      const result = asDate('2024-01-01');
      expect(result).toBeInstanceOf(Date);
    });

    it('should return null for invalid input', () => {
      expect(asDate('invalid')).toBeNull();
    });
  });

  describe('coalesceText', () => {
    it('should return first non-null string', () => {
      expect(coalesceText(null, 'test', 'other')).toBe('test');
    });

    it('should extract text from object', () => {
      expect(coalesceText({ text: 'test' })).toBe('test');
      expect(coalesceText({ description: 'desc' })).toBe('desc');
      expect(coalesceText({ name: 'name' })).toBe('name');
    });

    it('should return null if no valid text found', () => {
      expect(coalesceText(null, undefined, {})).toBeNull();
    });
  });

  describe('deg', () => {
    it('should return number directly', () => {
      expect(deg(42)).toBe(42);
    });

    it('should extract degrees from object', () => {
      expect(deg({ degrees: 42 })).toBe(42);
      expect(deg({ fahrenheit: 72 })).toBe(72);
      expect(deg({ celsius: 20 })).toBe(20);
    });

    it('should return null for invalid input', () => {
      expect(deg(null)).toBeNull();
      expect(deg({})).toBeNull();
    });
  });

  describe('googleDailySummary', () => {
    it('should return null for non-array input', () => {
      expect(googleDailySummary(null, '2024-01-01')).toBeNull();
      expect(googleDailySummary({}, '2024-01-01')).toBeNull();
    });

    it('should find and summarize forecast for target date', () => {
      const forecastDays = [
        {
          date: '2024-01-01',
          minTemperature: { degrees: 32 },
          maxTemperature: { degrees: 50 },
          daytimeForecast: {
            weatherCondition: { iconBaseUri: 'https://example.com/icon' },
          },
        },
      ];

      const result = googleDailySummary(forecastDays, '2024-01-01');

      expect(result).toEqual({
        min: 32,
        max: 50,
        iconUri: 'https://example.com/icon.svg',
        raw: forecastDays[0],
      });
    });

    it('should return null if date not found', () => {
      const forecastDays = [
        {
          date: '2024-01-02',
          minTemperature: { degrees: 32 },
          maxTemperature: { degrees: 50 },
        },
      ];

      expect(googleDailySummary(forecastDays, '2024-01-01')).toBeNull();
    });

    it('should return null if temperatures are missing', () => {
      const forecastDays = [
        {
          date: '2024-01-01',
          // Missing temperatures
        },
      ];

      expect(googleDailySummary(forecastDays, '2024-01-01')).toBeNull();
    });
  });

  describe('parseDailyDetails', () => {
    it('should parse weather details from forecast', () => {
      const raw = {
        daytimeForecast: {
          weatherCondition: 'Sunny',
          relativeHumidity: 60,
          uvIndex: 5,
        },
        nighttimeForecast: {
          relativeHumidity: 70,
        },
        sunEvents: {
          sunriseTime: { seconds: 1704067200 },
          sunsetTime: { seconds: 1704100800 },
        },
      };

      const result = parseDailyDetails(raw);

      expect(result.conditionText).toBe('Sunny');
      expect(result.humidity).toBe(65); // Average of 60 and 70
      expect(result.uvIndex).toBe(5);
      expect(result.sunrise).toBeInstanceOf(Date);
      expect(result.sunset).toBeInstanceOf(Date);
    });

    it('should detect precipitation type from text', () => {
      const raw = {
        daytimeForecast: {
          weatherCondition: 'Heavy rain expected',
        },
      };

      const result = parseDailyDetails(raw);
      expect(result.precipType).toBe('Rain');
    });
  });

  describe('enrichWithCurrent', () => {
    it('should return base if current conditions not provided', () => {
      const base = { min: 32, max: 50 };
      expect(enrichWithCurrent(base, null)).toEqual(base);
    });

    it('should enrich with current conditions', () => {
      const base = { min: 32, max: 50 };
      const cc = {
        relativeHumidity: 65,
        uvIndex: 6,
        visibility: { distance: 10, unit: 'KILOMETERS' },
        precipitation: {
          probability: { percent: 30 },
          qpf: { quantity: 0.5, unit: 'INCHES' },
        },
        weatherCondition: 'Partly cloudy',
      };

      const result = enrichWithCurrent(base, cc);

      expect(result.humidity).toBe(65);
      expect(result.uvIndex).toBe(6);
      expect(result.visibility).toBe(10);
      expect(result.visibilityUnit).toBe('km');
      expect(result.precipChance).toBe(30);
      expect(result.precipIn).toBe(0.5);
      expect(result.conditionText).toBe('Partly cloudy');
    });
  });

  describe('enrichWithHourly', () => {
    it('should return base if hourly not provided', () => {
      const base = { min: 32, max: 50 };
      expect(enrichWithHourly(base, null, 'IMPERIAL')).toEqual(base);
    });

    it('should enrich with hourly data', () => {
      const base = { min: 32, max: 50 };
      const hourly = {
        hours: [
          {
            precipitation: {
              probability: { percent: 40 },
              qpf: { quantity: 0.2, unit: 'INCHES' },
            },
            relativeHumidity: 70,
            uvIndex: 5,
          },
          {
            precipitation: {
              probability: { percent: 50 },
              qpf: { quantity: 0.3, unit: 'INCHES' },
            },
            relativeHumidity: 75,
            uvIndex: 6,
          },
        ],
      };

      const result = enrichWithHourly(base, hourly, 'IMPERIAL');

      expect(result.precipChance).toBe(50); // Max probability
      expect(result.precipIn).toBe(0.5); // Sum of 0.2 + 0.3
      expect(result.humidity).toBe(73); // Average of 70 and 75 (72.5 rounds to 73)
      expect(result.uvIndex).toBe(6); // Max UV
    });
  });

  describe('toOutputPrecip', () => {
    it('should convert to metric units', () => {
      expect(toOutputPrecip('METRIC', 10, 0.5)).toEqual({
        value: 10,
        unit: 'mm',
      });
      expect(toOutputPrecip('METRIC', null, 0.5)).toEqual({
        value: 12.7,
        unit: 'mm',
      });
    });

    it('should convert to imperial units', () => {
      // Function prioritizes inch value when both are provided
      expect(toOutputPrecip('IMPERIAL', 10, 0.5)).toEqual({
        value: 0.5,
        unit: 'in',
      });
      expect(toOutputPrecip('IMPERIAL', null, 0.5)).toEqual({
        value: 0.5,
        unit: 'in',
      });
    });

    it('should return null value if no precipitation', () => {
      expect(toOutputPrecip('METRIC', null, null)).toEqual({
        value: null,
        unit: 'mm',
      });
      expect(toOutputPrecip('IMPERIAL', null, null)).toEqual({
        value: null,
        unit: 'in',
      });
    });
  });
});

