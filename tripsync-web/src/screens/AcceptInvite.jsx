/**
 * Accept Trip Invite Screen Component
 * 
 * Handles email-based trip invitation acceptance via token. Waits for user
 * authentication, validates the invite token, and redirects to the trip detail
 * page upon successful acceptance.
 */

import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

/**
 * Accept trip invite screen component
 * 
 * Processes trip invitation tokens from URL parameters and accepts the invite
 * via Cloud Function. Shows status messages during the acceptance process.
 * 
 * @returns {JSX.Element} Invite acceptance status screen
 */
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState("Checking auth…");
  const fun = getFunctions();
  const tripId = params.get("tripId");
  const token = params.get("token");

  // Effect hook to handle invite acceptance after authentication
  // Validates invite token and redirects to trip detail page on success
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setStatus("Please sign in to accept the invite.");
        return;
      }
      if (!tripId || !token) {
        setStatus("Invalid invite link.");
        return;
      }
      try {
        setStatus("Accepting invite…");
        await httpsCallable(fun, "acceptTripInvite")({ tripId, token });
        setStatus("Accepted! Redirecting…");
        setTimeout(() => nav(`/trips/${tripId}`), 800);
      } catch (e) {
        console.error(e);
        setStatus(e.message || "Failed to accept invite.");
      }
    });
    return () => unsub();
  }, [tripId, token, nav]);

  return (
    <div className="card">
      <h2>Trip Invite</h2>
      <p>{status}</p>
    </div>
  );
}
