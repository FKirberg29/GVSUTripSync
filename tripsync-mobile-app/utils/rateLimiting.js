/**
 * Client-side Rate Limiting Utilities
 * 
 * Provides debounce, throttle, and rate limiting functions to prevent excessive API calls.
 * Includes pre-configured rate limiters for common operations and a wrapper for
 * Firebase Cloud Functions calls with automatic rate limit checking.
 */

/**
 * Debounce function - delays execution until after wait time has passed
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds (default: 300)
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
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

/**
 * Throttle function - limits execution to at most once per wait period
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds (default: 1000)
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
 * Rate limiter class for API calls with configurable limits
 * Tracks calls in memory (client-side only, resets on app restart)
 */
export class RateLimiter {
  /**
   * Creates a new rate limiter
   * @param {number} maxCalls - Maximum number of calls allowed in the window
   * @param {number} windowMs - Time window in milliseconds
   */
  constructor(maxCalls, windowMs) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
    this.calls = [];
  }

  /**
   * Checks if a call is allowed within the rate limit
   * @returns {boolean} True if call is allowed, false otherwise
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
   * Gets time until next call is allowed
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
   * Resets the rate limiter, clearing all tracked calls
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
  
  // File uploads
  fileUpload: new RateLimiter(10, 60 * 1000), // 10 uploads per minute
  
  // Firestore writes
  firestoreWrite: new RateLimiter(100, 60 * 1000), // 100 writes per minute
};

/**
 * Wrapper for Cloud Functions calls with rate limiting
 * Throws an error if rate limit is exceeded, otherwise executes the callable function
 * @param {Function} callable - Firebase callable function to execute
 * @param {Object} data - Data to pass to the function
 * @param {RateLimiter} limiter - Rate limiter to use (defaults to cloudFunction limiter)
 * @returns {Promise} Promise that resolves with function result
 * @throws {Error} If rate limit is exceeded
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
    if (error?.code === 'resource-exhausted' || error?.message?.includes('rate limit')) {
      // Server rate limit hit, reset client limiter to sync
      limiter.reset();
    }
    throw error;
  }
}
