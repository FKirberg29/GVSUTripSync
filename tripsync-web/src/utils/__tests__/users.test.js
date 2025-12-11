/**
 * Unit Tests for User Profile Utilities
 * 
 * Tests user profile fetching and display name resolution functions.
 * Mocks Firestore to test user profile retrieval and batch fetching.
 */

import { getUserProfile, getUserProfiles, getUserDisplayName } from '../users';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// Mocks Firebase Firestore for testing
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

jest.mock('../../firebaseConfig', () => ({
  db: {},
}));

describe('users utility functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return null for empty uid', async () => {
      const result = await getUserProfile('');
      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('should return null for null uid', async () => {
      const result = await getUserProfile(null);
      expect(result).toBeNull();
    });

    it('should fetch and return user profile', async () => {
      const mockDocRef = { id: 'user123' };
      const mockSnap = {
        exists: () => true,
        data: () => ({
          email: 'test@example.com',
          displayName: 'Test User',
          photoURL: 'https://example.com/photo.jpg',
        }),
      };

      doc.mockReturnValue(mockDocRef);
      getDoc.mockResolvedValue(mockSnap);

      const result = await getUserProfile('user123');

      expect(doc).toHaveBeenCalledWith(db, 'users', 'user123');
      expect(getDoc).toHaveBeenCalledWith(mockDocRef);
      expect(result).toEqual({
        uid: 'user123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
      });
    });

    it('should return default values for non-existent user', async () => {
      const mockDocRef = { id: 'user123' };
      const mockSnap = {
        exists: () => false,
      };

      doc.mockReturnValue(mockDocRef);
      getDoc.mockResolvedValue(mockSnap);

      const result = await getUserProfile('user123');

      expect(result).toEqual({
        uid: 'user123',
        email: null,
        displayName: null,
        photoURL: null,
      });
    });

    it('should handle missing fields in user data', async () => {
      const mockDocRef = { id: 'user123' };
      const mockSnap = {
        exists: () => true,
        data: () => ({
          email: 'test@example.com',
          // Missing displayName and photoURL
        }),
      };

      doc.mockReturnValue(mockDocRef);
      getDoc.mockResolvedValue(mockSnap);

      const result = await getUserProfile('user123');

      expect(result).toEqual({
        uid: 'user123',
        email: 'test@example.com',
        displayName: null,
        photoURL: null,
      });
    });

    it('should handle errors gracefully', async () => {
      const mockDocRef = { id: 'user123' };
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      doc.mockReturnValue(mockDocRef);
      getDoc.mockRejectedValue(new Error('Network error'));

      const result = await getUserProfile('user123');

      expect(result).toEqual({
        uid: 'user123',
        email: null,
        displayName: null,
        photoURL: null,
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getUserProfiles', () => {
    it('should return empty array for empty input', async () => {
      const result = await getUserProfiles([]);
      expect(result).toEqual([]);
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('should return empty array for null input', async () => {
      const result = await getUserProfiles(null);
      expect(result).toEqual([]);
    });

    it('should fetch multiple user profiles', async () => {
      const mockDocRef1 = { id: 'user1' };
      const mockDocRef2 = { id: 'user2' };
      const mockSnap1 = {
        exists: () => true,
        data: () => ({
          email: 'user1@example.com',
          displayName: 'User 1',
        }),
      };
      const mockSnap2 = {
        exists: () => true,
        data: () => ({
          email: 'user2@example.com',
          displayName: 'User 2',
        }),
      };

      doc
        .mockReturnValueOnce(mockDocRef1)
        .mockReturnValueOnce(mockDocRef2);
      getDoc
        .mockResolvedValueOnce(mockSnap1)
        .mockResolvedValueOnce(mockSnap2);

      const result = await getUserProfiles(['user1', 'user2']);

      expect(result).toHaveLength(2);
      expect(result[0].uid).toBe('user1');
      expect(result[1].uid).toBe('user2');
    });
  });

  describe('getUserDisplayName', () => {
    it('should return "Unknown" for null/undefined user', () => {
      expect(getUserDisplayName(null)).toBe('Unknown');
      expect(getUserDisplayName(undefined)).toBe('Unknown');
    });

    it('should return displayName if available', () => {
      const user = { displayName: 'John Doe' };
      expect(getUserDisplayName(user)).toBe('John Doe');
    });

    it('should fallback to email if displayName not available', () => {
      const user = { email: 'john@example.com' };
      expect(getUserDisplayName(user)).toBe('john@example.com');
    });

    it('should fallback to uid if displayName and email not available', () => {
      const user = { uid: 'user123' };
      expect(getUserDisplayName(user)).toBe('user123');
    });

    it('should return "Unknown" if no identifying info available', () => {
      expect(getUserDisplayName({})).toBe('Unknown');
    });

    it('should prioritize displayName over email', () => {
      const user = {
        displayName: 'John Doe',
        email: 'john@example.com',
        uid: 'user123',
      };
      expect(getUserDisplayName(user)).toBe('John Doe');
    });
  });
});

