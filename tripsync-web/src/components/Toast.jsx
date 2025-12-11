/**
 * Toast Component
 * 
 * Simple toast notification component that displays a message for a specified duration
 * and automatically dismisses itself after the timeout expires.
 */

import { useEffect, useState } from "react";

/**
 * Renders a toast notification that auto-dismisses after the timeout
 * @param {string} message - Message to display in the toast
 * @param {Function} onDone - Callback function called when toast is dismissed
 * @param {number} timeout - Timeout in milliseconds before auto-dismissing (default: 3500)
 */
export function Toast({ message, onDone, timeout = 3500 }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setShow(false); onDone?.(); }, timeout);
    return () => clearTimeout(t);
  }, [timeout, onDone]);

  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-2xl shadow-lg">
      {message}
    </div>
  );
}


