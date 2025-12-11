/**
 * Error Tracking and Analytics Utilities
 * 
 * Provides functions for tracking analytics events, screen views, user actions,
 * errors, performance metrics, and feature usage using Expo Firebase Analytics.
 * All tracking functions handle errors gracefully and won't crash the app if analytics fails.
 */

import * as Analytics from 'expo-firebase-analytics';

/**
 * Tracks a custom analytics event
 * @param {string} eventName - Name of the event to track
 * @param {Object} params - Optional parameters to include with the event
 */
export async function trackEvent(eventName, params = {}) {
  try {
    await Analytics.logEvent(eventName, params);
  } catch (error) {
    console.warn('Failed to log analytics event:', error);
  }
}

/**
 * Tracks a screen view event
 * @param {string} screenName - Name of the screen being viewed
 * @param {string|null} screenClass - Optional screen class (defaults to screenName)
 */
export async function trackScreenView(screenName, screenClass = null) {
  await trackEvent('screen_view', {
    screen_name: screenName,
    screen_class: screenClass || screenName,
  });
}

/**
 * Tracks user actions for analytics
 * @param {string} action - Name of the action performed
 * @param {Object} details - Additional details about the action
 */
export async function trackUserAction(action, details = {}) {
  await trackEvent('user_action', {
    action,
    ...details,
  });
}

/**
 * Tracks errors and exceptions in analytics
 * @param {Error|*} error - The error object or error message
 * @param {Object} context - Additional context about where the error occurred
 */
export function trackError(error, context = {}) {
  trackEvent('exception', {
    description: error?.message || String(error),
    fatal: false,
    ...context,
  }).catch(() => {
    // Silently fail if analytics fails
  });
  
  // Also log to console for debugging
  console.error('Error tracked:', error, context);
}

/**
 * Sets user context for analytics tracking
 * @param {Object|null} user - Firebase user object or null to clear context
 */
export function setUserContext(user) {
  // Delay to ensure native modules are ready
  setTimeout(() => {
    try {
      if (user) {
        // Set user properties in Firebase Analytics
        Analytics.setUserId(user.uid).catch(() => {});
        Analytics.setUserProperties({
          email: user.email,
          display_name: user.displayName,
        }).catch(() => {});
      } else {
        Analytics.setUserId(null).catch(() => {});
      }
    } catch (error) {
      console.warn('Failed to set user context:', error);
    }
  }, 500);
}

/**
 * Tracks performance metrics
 * @param {string} metricName - Name of the performance metric
 * @param {number} value - Value of the metric
 * @param {string} unit - Unit of measurement (default: 'ms')
 */
export async function trackPerformance(metricName, value, unit = 'ms') {
  await trackEvent('performance', {
    metric_name: metricName,
    value,
    unit,
  });
}

/**
 * Tracks feature usage for analytics
 * @param {string} featureName - Name of the feature being used
 * @param {Object} details - Additional details about the feature usage
 */
export async function trackFeatureUsage(featureName, details = {}) {
  await trackEvent('feature_usage', {
    feature_name: featureName,
    ...details,
  });
}
