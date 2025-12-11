/**
 * Login Screen Component
 * 
 * Provides Google Sign-In authentication for the TripSync web application.
 * Redirects authenticated users to the trips list page automatically.
 */

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithGoogle, auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import "./EmailAuth.css";

/**
 * Login screen component with Google authentication
 * 
 * @returns {JSX.Element} Login screen with Google sign-in button
 */
export default function Login() {
  const navigate = useNavigate();

  // Effect hook to listen for authentication state changes and redirect when signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate("/trips", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate]);

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2>Sign in</h2>
        
        <button onClick={signInWithGoogle}>
          Continue with Google
        </button>

        <p className="auth-alt">
          Or <a href="/email-auth">Sign in with Email</a>
        </p>
      </div>
    </div>
  );
}
