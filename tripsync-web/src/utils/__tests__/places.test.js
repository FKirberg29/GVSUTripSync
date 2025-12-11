/**
 * Unit Tests for Places Utility Functions
 * 
 * Tests Google Places API helper functions including display name extraction,
 * place title resolution, and place information fetching utilities.
 */

import {
  extractDisplayName,
  resolvePlaceTitle,
  getCanonicalPlaceInfo,
  fetchWithNew,
} from '../places';

describe('places utility functions', () => {
  describe('extractDisplayName', () => {
    it('should return empty string for null/undefined', () => {
      expect(extractDisplayName(null)).toBe('');
      expect(extractDisplayName(undefined)).toBe('');
    });

    it('should return trimmed string for string input', () => {
      expect(extractDisplayName('  Test Place  ')).toBe('Test Place');
      expect(extractDisplayName('Test')).toBe('Test');
    });

    it('should extract text from object with text property', () => {
      expect(extractDisplayName({ text: '  Place Name  ' })).toBe('Place Name');
    });

    it('should return empty string for objects without text property', () => {
      expect(extractDisplayName({ name: 'Test' })).toBe('');
    });

    it('should handle number input', () => {
      expect(extractDisplayName(123)).toBe('123');
    });
  });

  describe('resolvePlaceTitle', () => {
    it('should return displayName if available', () => {
      const details = { displayName: 'Test Place' };
      expect(resolvePlaceTitle(details)).toBe('Test Place');
    });

    it('should fallback to name if displayName not available', () => {
      const details = { name: 'Fallback Name' };
      expect(resolvePlaceTitle(details)).toBe('Fallback Name');
    });

    it('should fallback to formattedAddress if name not available', () => {
      const details = { formattedAddress: '123 Main St' };
      expect(resolvePlaceTitle(details)).toBe('123 Main St');
    });

    it('should return "Untitled" if no title available', () => {
      expect(resolvePlaceTitle({})).toBe('Untitled');
      expect(resolvePlaceTitle(null)).toBe('Untitled');
    });

    it('should prioritize displayName over name', () => {
      const details = {
        displayName: 'Display Name',
        name: 'Name',
        formattedAddress: 'Address',
      };
      expect(resolvePlaceTitle(details)).toBe('Display Name');
    });
  });

  describe('getCanonicalPlaceInfo', () => {
    beforeEach(() => {
      // Mock Google Maps Place
      global.google = {
        maps: {
          places: {
          Place: jest.fn().mockImplementation(({ id }) => ({
            id,
            fetchFields: jest.fn().mockResolvedValue(undefined),
            displayName: { text: 'Test Place' },
            formattedAddress: '123 Test St',
            location: {
              lat: () => 40.7128,
              lng: () => -74.0060,
            },
          })),
        },
      },
    };
    });

    it('should return null if Google Maps not available', async () => {
      global.google = undefined;
      const result = await getCanonicalPlaceInfo('place123');
      expect(result).toBeNull();
    });

    it('should fetch and return place info', async () => {
      const mockPlace = {
        id: 'place123',
        fetchFields: jest.fn().mockResolvedValue(undefined),
        displayName: { text: 'Test Place' },
        formattedAddress: '123 Test St',
        location: {
          lat: () => 40.7128,
          lng: () => -74.0060,
        },
      };

      global.google.maps.places.Place = jest.fn().mockReturnValue(mockPlace);

      const result = await getCanonicalPlaceInfo('place123');

      expect(global.google.maps.places.Place).toHaveBeenCalledWith({
        id: 'place123',
        requestedLanguage: 'en',
      });
      expect(mockPlace.fetchFields).toHaveBeenCalledWith({
        fields: ['id', 'displayName', 'formattedAddress', 'location'],
      });
      expect(result).toEqual({
        id: 'place123',
        displayName: 'Test Place',
        formattedAddress: '123 Test St',
        location: { lat: 40.7128, lng: -74.0060 },
      });
    });

    it('should handle place without location', async () => {
      const mockPlace = {
        id: 'place123',
        fetchFields: jest.fn().mockResolvedValue(undefined),
        displayName: { text: 'Test Place' },
        formattedAddress: '123 Test St',
        location: null,
      };

      global.google.maps.places.Place = jest.fn().mockReturnValue(mockPlace);

      const result = await getCanonicalPlaceInfo('place123');

      expect(result.location).toBeNull();
    });
  });

  describe('fetchWithNew', () => {
    beforeEach(() => {
      // Reset global.google before each test
      global.google = {
        maps: {
          places: {
            Place: jest.fn(),
          },
        },
      };
    });

    it('should return null if Google Maps not available', async () => {
      global.google = undefined;
      const result = await fetchWithNew('place123');
      expect(result).toBeNull();
    });

    it('should fetch extended place info', async () => {
      const mockPlace = {
        id: 'place123',
        fetchFields: jest.fn().mockResolvedValue(undefined),
        displayName: { text: 'Test Place' },
        formattedAddress: '123 Test St',
        location: {
          lat: () => 40.7128,
          lng: () => -74.0060,
        },
        rating: 4.5,
        userRatingCount: 100,
        types: ['restaurant', 'food'],
      };

      global.google.maps.places.Place = jest.fn().mockReturnValue(mockPlace);

      const result = await fetchWithNew('place123');

      expect(global.google.maps.places.Place).toHaveBeenCalledWith({
        id: 'place123',
        requestedLanguage: 'en',
      });
      expect(mockPlace.fetchFields).toHaveBeenCalledWith({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'types',
        ],
      });
      expect(result).toEqual({
        id: 'place123',
        displayName: 'Test Place',
        formattedAddress: '123 Test St',
        location: { lat: 40.7128, lng: -74.0060 },
        rating: 4.5,
        userRatingCount: 100,
        types: ['restaurant', 'food'],
      });
    });
  });
});

