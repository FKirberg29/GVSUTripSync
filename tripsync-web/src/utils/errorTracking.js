/**
 * Error Tracking and Analytics Utilities
 * 
 * Provides Firebase Analytics integration for tracking user actions, screen views,
 * errors, performance metrics, and feature usage. Handles analytics initialization
 * and provides convenience functions for common tracking scenarios.
 */

import { getAnalytics, logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { getApp } from 'firebase/app';

// Analytics instance cached after initialization
let analytics = null;

export function initAnalytics() {
  try {
    const app = getApp();
    analytics = getAnalytics(app);
    return analytics;
  } catch (error) {
    console.warn('Firebase Analytics initialization failed:', error);
    return null;
  }
}

/**
 * Get analytics instance
 */
export function getAnalyticsInstance() {
  if (!analytics) {
    analytics = initAnalytics();
  }
  return analytics;
}

/**
 * Track a custom event
 */
export function trackEvent(eventName, params = {}) {
  // Firebase Analytics
  const analyticsInstance = getAnalyticsInstance();
  if (analyticsInstance) {
    try {
      logEvent(analyticsInstance, eventName, params);
    } catch (error) {
      console.warn('Failed to log analytics event:', error);
    }
  }
}

/**
 * Track screen view
 */
export function trackScreenView(screenName, screenClass = null) {
  trackEvent('screen_view', {
    screen_name: screenName,
    screen_class: screenClass || screenName,
  });
}

/**
 * Track user actions
 */
export function trackUserAction(action, details = {}) {
  trackEvent('user_action', {
    action,
    ...details,
  });
}

/**
 * Track errors
 */
export function trackError(error, context = {}) {
  // Firebase Analytics
  const analyticsInstance = getAnalyticsInstance();
  if (analyticsInstance) {
    try {
      logEvent(analyticsInstance, 'exception', {
        description: error.message || String(error),
        fatal: false,
        ...context,
      });
    } catch (e) {
      console.warn('Failed to log error to analytics:', e);
    }
  }
  
  // Also log to console for debugging
  console.error('Error tracked:', error, context);
}

/**
 * Set user context for analytics
 */
export function setUserContext(user) {
  const analyticsInstance = getAnalyticsInstance();
  if (analyticsInstance) {
    try {
      if (user) {
        setUserId(analyticsInstance, user.uid);
        setUserProperties(analyticsInstance, {
          email: user.email,
          display_name: user.displayName,
        });
      } else {
        setUserId(analyticsInstance, null);
      }
    } catch (error) {
      console.warn('Failed to set user properties:', error);
    }
  }
}

/**
 * Track performance metrics
 */
export function trackPerformance(metricName, value, unit = 'ms') {
  trackEvent('performance', {
    metric_name: metricName,
    value,
    unit,
  });
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(featureName, details = {}) {
  trackEvent('feature_usage', {
    feature_name: featureName,
    ...details,
  });
}

