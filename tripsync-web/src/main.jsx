/**
 * TripSync Web App - Entry Point
 * 
 * This is the application entry point that renders the React app into the DOM.
 * Sets up the error boundary, router, and global styles.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import './index.css';
import "./screens/theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);
