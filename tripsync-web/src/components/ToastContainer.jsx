/**
 * ToastContainer Component
 * 
 * Container component for managing multiple toast notifications with support for user info,
 * different toast types, and smooth animations. Each toast can display user avatars and
 * actor information for activity-based notifications.
 */

import { useEffect, useState } from "react";
import { getUserProfile } from "../utils/users.js";
import "./ToastContainer.css";

/**
 * Renders a container with multiple toast notifications
 * @param {Array} toasts - Array of toast objects with id, message, type, actorId, etc.
 * @param {Function} onDismiss - Callback function called when a toast is dismissed, receives toast id
 */
export function ToastContainer({ toasts = [], onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss?.(toast.id)}
        />
      ))}
    </div>
  );
}

/**
 * Individual toast item component that fetches and displays user info
 * @param {Object} toast - Toast object with message, type, actorId, timeout, etc.
 * @param {Function} onDismiss - Callback function called when toast is dismissed
 */
function ToastItem({ toast, onDismiss }) {
  const [show, setShow] = useState(true);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    if (toast.actorId && toast.actorId !== "unknown") {
      getUserProfile(toast.actorId).then(setUserInfo);
    }
  }, [toast.actorId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(() => onDismiss?.(), 300); // Wait for animation
    }, toast.timeout || 5000);

    return () => clearTimeout(timer);
  }, [toast.timeout, onDismiss]);

  if (!show) return null;

  const type = toast.type || "info";
  const displayName = userInfo?.displayName || toast.actorName || "Someone";
  const photoURL = userInfo?.photoURL;

  return (
    <div
      className={`toast-item toast-${type} ${!show ? "toast-exit" : ""}`}
      onClick={onDismiss}
    >
      <div className="toast-content">
        {photoURL && (
          <img
            src={photoURL}
            alt={displayName}
            className="toast-avatar"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        )}
        {!photoURL && (
          <div className="toast-avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="toast-text">
          <div className="toast-message">{toast.message}</div>
          {toast.actorId && toast.actorId !== "unknown" && (
            <div className="toast-actor">{displayName}</div>
          )}
        </div>
      </div>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}>
        ×
      </button>
    </div>
  );
}

