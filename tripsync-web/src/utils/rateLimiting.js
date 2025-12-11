/**
 * Client-side rate limiting utilities
 * Provides debounce and throttle functions to prevent excessive API calls
 */

/**
 * Debounce function - delays execution until after wait time has passed
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - If true, trigger on leading edge instead of trailing
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

/**
 * Throttle function - limits execution to at most once per wait period
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = 1000) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Rate limiter for API calls with configurable limits
 * Tracks calls in memory (client-side only)
 */
export class RateLimiter {
  constructor(maxCalls, windowMs) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
    this.calls = [];
  }

  /**
   * Check if a call is allowed
   * @returns {boolean} True if call is allowed
   */
  isAllowed() {
    const now = Date.now();
    // Remove calls outside the window
    this.calls = this.calls.filter((time) => now - time < this.windowMs);
    
    if (this.calls.length >= this.maxCalls) {
      return false;
    }
    
    this.calls.push(now);
    return true;
  }

  /**
   * Get time until next call is allowed (in ms)
   * @returns {number} Milliseconds until next call allowed, or 0 if allowed now
   */
  getTimeUntilNextAllowed() {
    if (this.calls.length < this.maxCalls) {
      return 0;
    }
    
    const now = Date.now();
    const oldestCall = Math.min(...this.calls);
    const timeSinceOldest = now - oldestCall;
    return Math.max(0, this.windowMs - timeSinceOldest);
  }

  /**
   * Reset the rate limiter
   */
  reset() {
    this.calls = [];
  }
}

/**
 * Pre-configured rate limiters for common operations
 */
export const rateLimiters = {
  // Cloud Functions calls
  cloudFunction: new RateLimiter(30, 60 * 1000), // 30 calls per minute
  
  // Search operations
  search: new RateLimiter(10, 5 * 1000), // 10 searches per 5 seconds
  
  // Friend requests
  friendRequest: new RateLimiter(5, 60 * 1000), // 5 per minute
  
  // Trip invitations
  tripInvite: new RateLimiter(10, 60 * 1000), // 10 per minute
  
  // File uploads
  fileUpload: new RateLimiter(10, 60 * 1000), // 10 uploads per minute
  
  // Firestore writes
  firestoreWrite: new RateLimiter(100, 60 * 1000), // 100 writes per minute
};

/**
 * Wrapper for Cloud Functions calls with rate limiting
 * @param {Function} callable - Firebase callable function
 * @param {Object} data - Data to pass to function
 * @param {RateLimiter} limiter - Rate limiter to use (defaults to cloudFunction)
 * @returns {Promise} Promise that resolves with function result
 */
export async function rateLimitedCall(callable, data, limiter = rateLimiters.cloudFunction) {
  if (!limiter.isAllowed()) {
    const waitTime = limiter.getTimeUntilNextAllowed();
    throw new Error(
      `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds before trying again.`
    );
  }
  
  try {
    return await callable(data);
  } catch (error) {
    // If it's a rate limit error from server, don't count it against client limiter
    if (error.code === 'resource-exhausted') {
      // Server rate limit hit, reset client limiter to sync
      limiter.reset();
    }
    throw error;
  }
}

/**
 * Create a debounced version of a function with error handling
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {Function} onError - Optional error handler
 * @returns {Function} Debounced function with error handling
 */
export function debounceWithErrorHandling(func, wait = 300, onError = null) {
  const debounced = debounce(func, wait);
  return async function executedFunction(...args) {
    try {
      return await debounced(...args);
    } catch (error) {
      if (onError) {
        onError(error, ...args);
      } else {
        console.error('Debounced function error:', error);
      }
      throw error;
    }
  };
}

