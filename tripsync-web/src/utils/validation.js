/**
 * Input Validation and Sanitization Utilities
 * 
 * Provides comprehensive input validation and sanitization functions to prevent
 * XSS attacks, validate data formats, and enforce length limits. Uses DOMPurify
 * for HTML sanitization and validator.js for format validation.
 */

import DOMPurify from 'dompurify';
import validator from 'validator';

/**
 * Maximum character lengths for different input field types
 */
export const MAX_LENGTHS = {
  TRIP_NAME: 100,
  CHAT_MESSAGE: 5000,
  COMMENT: 2000,
  NOTES: 10000,
  DISPLAY_NAME: 50,
  EMAIL: 255,
  URL: 2048,
};

// Allowed MIME types for file uploads
export const ALLOWED_MIME_TYPES = {
  IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
  ALL: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 
        'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
};

// Maximum file sizes (in bytes)
export const MAX_FILE_SIZES = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 100 * 1024 * 1024, // 100MB
  GENERAL: 100 * 1024 * 1024, // 100MB
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param {string} dirty - Potentially unsafe HTML string
 * @param {Object} options - DOMPurify options
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHTML(dirty, options = {}) {
  if (typeof dirty !== 'string') return '';
  
  const defaultOptions = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  };
  
  return DOMPurify.sanitize(dirty, { ...defaultOptions, ...options });
}

/**
 * Sanitize plain text (removes HTML tags)
 * @param {string} text - Text that may contain HTML
 * @returns {string} Plain text without HTML
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
}

/**
 * Validate and sanitize email address
 * @param {string} email - Email to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, sanitized: '', error: 'Email is required' };
  }
  
  const trimmed = email.trim().toLowerCase();
  
  if (trimmed.length > MAX_LENGTHS.EMAIL) {
    return { valid: false, sanitized: trimmed, error: `Email must be ${MAX_LENGTHS.EMAIL} characters or less` };
  }
  
  if (!validator.isEmail(trimmed)) {
    return { valid: false, sanitized: trimmed, error: 'Invalid email format' };
  }
  
  return { valid: true, sanitized: trimmed, error: null };
}

/**
 * Validate and sanitize URL
 * @param {string} url - URL to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateURL(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, sanitized: '', error: 'URL is required' };
  }
  
  const trimmed = url.trim();
  
  if (trimmed.length > MAX_LENGTHS.URL) {
    return { valid: false, sanitized: trimmed, error: `URL must be ${MAX_LENGTHS.URL} characters or less` };
  }
  
  if (!validator.isURL(trimmed, { require_protocol: true })) {
    return { valid: false, sanitized: trimmed, error: 'Invalid URL format (must include http:// or https://)' };
  }
  
  return { valid: true, sanitized: trimmed, error: null };
}

/**
 * Validate text length
 * @param {string} text - Text to validate
 * @param {number} maxLength - Maximum allowed length
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateLength(text, maxLength, fieldName = 'Text') {
  if (text === null || text === undefined) {
    return { valid: true, sanitized: '', error: null };
  }
  
  const sanitized = sanitizeText(String(text));
  
  if (sanitized.length > maxLength) {
    return { 
      valid: false, 
      sanitized, 
      error: `${fieldName} must be ${maxLength} characters or less (currently ${sanitized.length})` 
    };
  }
  
  return { valid: true, sanitized, error: null };
}

/**
 * Validate chat message
 * @param {string} message - Chat message to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateChatMessage(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, sanitized: '', error: 'Message cannot be empty' };
  }
  
  const trimmed = message.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Message cannot be empty' };
  }
  
  return validateLength(trimmed, MAX_LENGTHS.CHAT_MESSAGE, 'Message');
}

/**
 * Validate comment
 * @param {string} comment - Comment to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateComment(comment) {
  if (!comment || typeof comment !== 'string') {
    return { valid: false, sanitized: '', error: 'Comment cannot be empty' };
  }
  
  const trimmed = comment.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Comment cannot be empty' };
  }
  
  return validateLength(trimmed, MAX_LENGTHS.COMMENT, 'Comment');
}

/**
 * Validate trip name
 * @param {string} name - Trip name to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateTripName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, sanitized: '', error: 'Trip name is required' };
  }
  
  const trimmed = sanitizeText(name.trim());
  
  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Trip name cannot be empty' };
  }
  
  if (trimmed.length > MAX_LENGTHS.TRIP_NAME) {
    return { 
      valid: false, 
      sanitized: trimmed, 
      error: `Trip name must be ${MAX_LENGTHS.TRIP_NAME} characters or less` 
    };
  }
  
  return { valid: true, sanitized: trimmed, error: null };
}

/**
 * Validate notes
 * @param {string} notes - Notes to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function validateNotes(notes) {
  if (!notes || notes.length === 0) {
    return { valid: true, sanitized: '', error: null };
  }
  
  return validateLength(String(notes), MAX_LENGTHS.NOTES, 'Notes');
}

/**
 * Validate file upload
 * @param {File|Object} file - File object or file-like object
 * @param {string[]} allowedTypes - Array of allowed MIME types
 * @param {number} maxSize - Maximum file size in bytes
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateFile(file, allowedTypes = ALLOWED_MIME_TYPES.ALL, maxSize = MAX_FILE_SIZES.GENERAL) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  
  const fileSize = file.size || file.fileSize || 0;
  const fileType = file.type || file.mimeType || '';
  
  if (fileSize === 0) {
    return { valid: false, error: 'File is empty' };
  }
  
  if (fileSize > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);
    return { 
      valid: false, 
      error: `File size (${fileSizeMB}MB) exceeds maximum allowed size (${maxSizeMB}MB)` 
    };
  }
  
  if (fileType && allowedTypes.length > 0 && !allowedTypes.includes(fileType)) {
    return { 
      valid: false, 
      error: `File type "${fileType}" is not allowed. Allowed types: ${allowedTypes.join(', ')}` 
    };
  }
  
  return { valid: true, error: null };
}

/**
 * Rate limiting helper (client-side)
 * Creates a function that throttles calls
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Minimum delay between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function createRateLimiter(fn, delay = 1000) {
  let lastCall = 0;
  let timeoutId = null;
  
  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      return fn(...args);
    } else {
      // Clear existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Schedule call for after delay
      const remainingDelay = delay - timeSinceLastCall;
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, remainingDelay);
      
      return Promise.resolve();
    }
  };
}

