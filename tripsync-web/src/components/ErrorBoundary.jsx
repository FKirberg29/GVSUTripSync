/**
 * ErrorBoundary Component
 * 
 * React error boundary that catches JavaScript errors anywhere in the component tree.
 * Displays a user-friendly error message and logs errors to analytics.
 * Provides a button to reset the error state and navigate home.
 */

import React from 'react';
import { trackError } from '../utils/errorTracking.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    trackError(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center',
          maxWidth: '600px',
          margin: '0 auto',
          marginTop: '100px'
        }}>
          <h2>Something went wrong</h2>
          <p>We're sorry, but something unexpected happened. The error has been reported.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/trips';
            }}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#2A9D8F',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Go to Home
          </button>
          {this.state.error && (
            <details style={{ marginTop: '20px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer' }}>Error Details</summary>
              <pre style={{ 
                marginTop: '10px', 
                padding: '10px', 
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto'
              }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
