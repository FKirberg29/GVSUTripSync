/**
 * Unit Tests for Validation Utilities
 * 
 * Tests input validation and sanitization functions including HTML sanitization,
 * email/URL validation, length validation, and file validation. Uses real
 * DOMPurify and validator libraries for accurate testing in jsdom environment.
 */

// Uses real DOMPurify and validator libraries for accurate testing
// jsdom environment provides the DOM needed for DOMPurify
import {
  sanitizeHTML,
  sanitizeText,
  validateEmail,
  validateURL,
  validateLength,
  validateChatMessage,
  validateComment,
  validateTripName,
  validateNotes,
  validateFile,
  MAX_LENGTHS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZES,
} from '../validation.js';

describe('Validation Utilities', () => {
  describe('sanitizeHTML', () => {
    it('should remove dangerous HTML tags', () => {
      const dirty = '<script>alert("xss")</script><p>Safe text</p>';
      const clean = sanitizeHTML(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Safe text');
    });

    it('should allow safe HTML tags', () => {
      const dirty = '<b>Bold</b> <i>Italic</i> <a href="https://example.com">Link</a>';
      const clean = sanitizeHTML(dirty);
      expect(clean).toContain('<b>');
      expect(clean).toContain('<i>');
      expect(clean).toContain('<a');
    });

    it('should handle empty strings', () => {
      expect(sanitizeHTML('')).toBe('');
      expect(sanitizeHTML(null)).toBe('');
    });
  });

  describe('sanitizeText', () => {
    it('should remove all HTML tags', () => {
      const dirty = '<p>Text</p><script>alert("xss")</script>';
      const clean = sanitizeText(dirty);
      expect(clean).toBe('Text');
      expect(clean).not.toContain('<');
      expect(clean).not.toContain('>');
    });

    it('should handle non-string input', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(123)).toBe('');
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const result = validateEmail('test@example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.sanitized).toBe('test@example.com');
    });

    it('should reject invalid email formats', () => {
      const result = validateEmail('not-an-email');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid email format');
    });

    it('should trim and lowercase emails', () => {
      const result = validateEmail('  Test@Example.COM  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('test@example.com');
    });

    it('should reject emails exceeding max length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = validateEmail(longEmail);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('characters or less');
    });

    it('should handle empty/null emails', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('validateURL', () => {
    it('should validate correct URLs with protocol', () => {
      const result = validateURL('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject URLs without protocol', () => {
      const result = validateURL('example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('http:// or https://');
    });

    it('should reject invalid URL formats', () => {
      const result = validateURL('not a url');
      expect(result.valid).toBe(false);
    });

    it('should reject URLs exceeding max length', () => {
      const longURL = 'https://example.com/' + 'a'.repeat(2100);
      const result = validateURL(longURL);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('characters or less');
    });
  });

  describe('validateLength', () => {
    it('should validate text within max length', () => {
      const result = validateLength('Short text', 100, 'Field');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject text exceeding max length', () => {
      const longText = 'a'.repeat(101);
      const result = validateLength(longText, 100, 'Field');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('100 characters or less');
      expect(result.error).toContain('currently 101');
    });

    it('should handle null/undefined', () => {
      const result = validateLength(null, 100, 'Field');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('');
    });

    it('should sanitize HTML in text', () => {
      const result = validateLength('<script>alert("xss")</script>Text', 100, 'Field');
      expect(result.sanitized).not.toContain('<script>');
      expect(result.sanitized).toContain('Text');
    });
  });

  describe('validateChatMessage', () => {
    it('should validate normal messages', () => {
      const result = validateChatMessage('Hello, world!');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject empty messages', () => {
      const result = validateChatMessage('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject messages exceeding max length', () => {
      const longMessage = 'a'.repeat(MAX_LENGTHS.CHAT_MESSAGE + 1);
      const result = validateChatMessage(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(MAX_LENGTHS.CHAT_MESSAGE.toString());
    });

    it('should sanitize HTML in messages', () => {
      const result = validateChatMessage('<script>alert("xss")</script>Hello');
      expect(result.sanitized).not.toContain('<script>');
      expect(result.sanitized).toContain('Hello');
    });
  });

  describe('validateComment', () => {
    it('should validate normal comments', () => {
      const result = validateComment('Great place!');
      expect(result.valid).toBe(true);
    });

    it('should reject empty comments', () => {
      const result = validateComment('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject comments exceeding max length', () => {
      const longComment = 'a'.repeat(MAX_LENGTHS.COMMENT + 1);
      const result = validateComment(longComment);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(MAX_LENGTHS.COMMENT.toString());
    });
  });

  describe('validateTripName', () => {
    it('should validate normal trip names', () => {
      const result = validateTripName('Summer Vacation 2024');
      expect(result.valid).toBe(true);
    });

    it('should reject empty trip names', () => {
      const result = validateTripName('');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cannot be empty|is required/);
    });

    it('should reject trip names exceeding max length', () => {
      const longName = 'a'.repeat(MAX_LENGTHS.TRIP_NAME + 1);
      const result = validateTripName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(MAX_LENGTHS.TRIP_NAME.toString());
    });

    it('should sanitize HTML in trip names', () => {
      const result = validateTripName('<script>alert("xss")</script>Trip');
      expect(result.sanitized).not.toContain('<script>');
      expect(result.sanitized).toContain('Trip');
    });
  });

  describe('validateNotes', () => {
    it('should validate normal notes', () => {
      const result = validateNotes('Some notes here');
      expect(result.valid).toBe(true);
    });

    it('should allow empty notes', () => {
      const result = validateNotes('');
      expect(result.valid).toBe(true);
    });

    it('should reject notes exceeding max length', () => {
      const longNotes = 'a'.repeat(MAX_LENGTHS.NOTES + 1);
      const result = validateNotes(longNotes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(MAX_LENGTHS.NOTES.toString());
    });
  });

  describe('validateFile', () => {
    it('should validate files within size limit', () => {
      const file = { size: 1024 * 1024, type: 'image/jpeg' }; // 1MB
      const result = validateFile(file, ALLOWED_MIME_TYPES.IMAGE, MAX_FILE_SIZES.IMAGE);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject files exceeding size limit', () => {
      const file = { size: 11 * 1024 * 1024, type: 'image/jpeg' }; // 11MB
      const result = validateFile(file, ALLOWED_MIME_TYPES.IMAGE, MAX_FILE_SIZES.IMAGE);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject files with invalid MIME types', () => {
      const file = { size: 1024, type: 'application/pdf' };
      const result = validateFile(file, ALLOWED_MIME_TYPES.IMAGE, MAX_FILE_SIZES.IMAGE);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject empty files', () => {
      const file = { size: 0, type: 'image/jpeg' };
      const result = validateFile(file, ALLOWED_MIME_TYPES.IMAGE, MAX_FILE_SIZES.IMAGE);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle files without type', () => {
      const file = { size: 1024 };
      const result = validateFile(file, [], MAX_FILE_SIZES.IMAGE);
      expect(result.valid).toBe(true); // No type restriction
    });
  });
});

