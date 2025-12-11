/**
 * Email Authentication Screen Component
 * 
 * Provides email/password authentication for the TripSync web application.
 * Supports both sign-up and sign-in modes with automatic redirect after successful authentication.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import "./EmailAuth.css";

/**
 * Email authentication screen component
 * 
 * @returns {JSX.Element} Email authentication form with sign-up/sign-in toggle
 */
export default function EmailAuth() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Effect hook to listen for authentication state changes and redirect when signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate("/trips", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate]);

  /**
   * Handles form submission for email/password authentication
   * Creates new account or signs in existing user based on isSignUp state
   * @param {Event} e - Form submit event
   */
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2>{isSignUp ? "Sign Up" : "Log In"}</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min. 6 chars)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button type="submit">
            {isSignUp ? "Create Account" : "Log In"}
          </button>
        </form>

        {error && <p className="auth-error">{error}</p>}

        <p className="auth-alt">
          {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? "Log In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
}
