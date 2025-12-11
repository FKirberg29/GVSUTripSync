/**
 * Custom React Hooks for Notifications and Change Tracking
 * 
 * Provides hooks for managing toast notifications and tracking real-time item changes
 * in the itinerary. Supports multiple toasts, automatic dismissal, and temporary
 * change highlighting with auto-removal.
 */

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook for managing notifications/toasts
 * 
 * Manages a list of toast notifications with support for multiple simultaneous toasts.
 * Each toast can have a custom timeout for automatic dismissal. Toasts are identified
 * by unique IDs generated using timestamp and counter.
 * 
 * @returns {Object} Object containing toasts array and management functions
 * @returns {Array} returns.toasts - Array of active toast objects
 * @returns {Function} returns.addToast - Function to add a new toast
 * @returns {Function} returns.removeToast - Function to remove a toast by ID
 * @returns {Function} returns.clearAll - Function to clear all toasts
 */
export function useNotifications() {
  const [toasts, setToasts] = useState([]);
  // Counter ref to ensure unique IDs even if multiple toasts are added in the same millisecond
  const idCounterRef = useRef(0);

  /**
   * Adds a new toast notification to the list
   * Generates a unique ID and applies default values for optional properties
   * @param {Object} toast - Toast configuration object
   * @param {string} toast.message - Toast message text
   * @param {string} [toast.type="info"] - Toast type (info, success, error, warning)
   * @param {string} [toast.actorId] - ID of user who triggered the action
   * @param {string} [toast.actorName] - Display name of user who triggered the action
   * @param {number} [toast.timeout=5000] - Auto-dismiss timeout in milliseconds
   * @returns {string} Unique toast ID
   */
  const addToast = useCallback((toast) => {
    // Generates unique ID using timestamp and counter
    const id = `toast-${Date.now()}-${idCounterRef.current++}`;
    const newToast = {
      id,
      message: toast.message || "",
      type: toast.type || "info",
      actorId: toast.actorId,
      actorName: toast.actorName,
      timeout: toast.timeout || 5000,
      ...toast,
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  /**
   * Removes a toast from the list by its ID
   * @param {string} id - Toast ID to remove
   */
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Clears all active toasts from the list
   */
  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    addToast,
    removeToast,
    clearAll,
  };
}

/**
 * Hook for tracking real-time item changes for highlighting
 * 
 * Tracks changes to itinerary items (add, remove, move, reorder) and highlights them
 * temporarily in the UI. Changes are automatically removed after 3 seconds, but can
 * be manually cleared. Useful for showing users when other trip members make changes
 * in real-time.
 * 
 * @returns {Object} Object containing changed items map and management functions
 * @returns {Map} returns.changedItems - Map of itemId -> {type, actorId, timestamp}
 * @returns {Function} returns.markItemChanged - Function to mark an item as changed
 * @returns {Function} returns.clearItemChange - Function to manually clear a change
 * @returns {Function} returns.clearAll - Function to clear all changes and timers
 */
export function useItemChangeTracking() {
  // Stores map of itemId -> change info (type, actorId, timestamp)
  const [changedItems, setChangedItems] = useState(new Map());
  // Stores map of itemId -> setTimeout timer for auto-removal
  const timersRef = useRef(new Map());

  /**
   * Marks an itinerary item as changed and schedules auto-removal
   * Clears any existing timer for the item before setting a new one
   * @param {string} itemId - ID of the itinerary item that changed
   * @param {string} changeType - Type of change: 'add', 'remove', 'move', or 'reorder'
   * @param {string} [actorId=null] - ID of user who made the change
   */
  const markItemChanged = useCallback((itemId, changeType, actorId = null) => {
    // Clears existing timer for this item if one exists
    const existingTimer = timersRef.current.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Marks item as changed with timestamp and actor info
    setChangedItems((prev) => {
      const next = new Map(prev);
      next.set(itemId, {
        type: changeType, // 'add', 'remove', 'move', 'reorder'
        actorId,
        timestamp: Date.now(),
      });
      return next;
    });

    // Schedules automatic removal after 3 seconds
    const timer = setTimeout(() => {
      setChangedItems((prev) => {
        const next = new Map(prev);
        next.delete(itemId);
        return next;
      });
      timersRef.current.delete(itemId);
    }, 3000);

    timersRef.current.set(itemId, timer);
  }, []);

  /**
   * Manually clears a change for a specific item
   * Cancels the auto-removal timer and removes the item from changed items
   * @param {string} itemId - ID of the item to clear change for
   */
  const clearItemChange = useCallback((itemId) => {
    const timer = timersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(itemId);
    }
    setChangedItems((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  /**
   * Clears all changes and cancels all pending timers
   * Useful for cleanup when navigating away or resetting the view
   */
  const clearAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setChangedItems(new Map());
  }, []);

  return {
    changedItems,
    markItemChanged,
    clearItemChange,
    clearAll,
  };
}

