import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';


// Core imports
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';


// Initialize i18n before app starts
import './i18n';

// Initialize API client and global services
import './services/apiClient';
import './services/analyticsService';

// ================================
// ENVIRONMENT & SECURITY VALIDATION
// ================================

// Validate required environment variables at startup
const requiredEnvVars = [
  'VITE_API_BASE_URL',
  'VITE_APP_VERSION'
];

requiredEnvVars.forEach(envVar => {
  if (!import.meta.env[envVar]) {
    throw new Error(`Required environment variable ${envVar} is missing`);
  }
});

// ================================
// PRODUCTION SECURITY & PERFORMANCE
// ================================

// Disable console outputs in production
if (import.meta.env.PROD) {
  console.warn = () => {};
  console.error = () => {};
  console.log = () => {};
}

// Content Security Policy validation (if headers aren't set by server)
if (import.meta.env.PROD && !document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
  console.warn('CSP headers should be set by server for production');
}

// ================================
// GLOBAL ERROR HANDLING
// ================================

// Global error handler with environment-aware logging
window.onerror = function (msg, url, lineNo, columnNo, error) {
  const errorData = {
    message: msg,
    source: url,
    line: lineNo,
    column: columnNo,
    error: error?.stack,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    userId: localStorage.getItem('userId') || 'anonymous'
  };

  if (import.meta.env.DEV) {
    console.error('Global Error:', errorData.message  || errorData.error || errorData);
  } else {
    // Send to error reporting service (Sentry, LogRocket, etc.)
    logErrorToService(errorData);
    showUserFriendlyError('Something went wrong. Please refresh the page or try again.');
  }
  
  return true; // Prevent default browser error handling
};

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  const errorData = {
    type: 'unhandledrejection',
    reason: event.reason,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userId: localStorage.getItem('userId') || 'anonymous'
  };

  if (import.meta.env.DEV) {
    console.error('Unhandled Promise Rejection:', errorData);
  } else {
    logErrorToService(errorData);
    showUserFriendlyError('A background process failed. The app should continue working normally.');
  }
  
  event.preventDefault(); // Prevent unhandled rejection warning
});

// ================================
// PWA & OFFLINE CAPABILITIES
// ================================

// Service Worker registration
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// App install prompt handling
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  // Update UI to notify the user they can install the PWA
  showInstallPrompt();
});

// ================================
// ACCESSIBILITY SETUP
// ================================

// Set language attribute on HTML element
document.documentElement.lang = localStorage.getItem('i18nextLng') || 'en';

// Add skip-to-content link for screen readers
const skipLink = document.createElement('a');
skipLink.href = '#main';
skipLink.textContent = 'Skip to main content';
skipLink.className = 'sr-only focus:not-sr-only';
skipLink.style.cssText = `
  position: absolute;
  top: -40px;
  left: 6px;
  z-index: 1000;
  padding: 8px;
  background: #000;
  color: #fff;
  text-decoration: none;
  border-radius: 4px;
`;
skipLink.addEventListener('focus', () => {
  skipLink.style.top = '6px';
});
skipLink.addEventListener('blur', () => {
  skipLink.style.top = '-40px';
});
document.body.insertBefore(skipLink, document.body.firstChild);

// ================================
// DEVELOPMENT ENHANCEMENTS
// ================================

if (import.meta.env.DEV) {
  // Enable React DevTools
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.onCommitFiberRoot();
  
  // Log environment info
  console.log('🚀 Development Mode');
  console.log('📱 App Version:', import.meta.env.VITE_APP_VERSION);
  console.log('🌍 API Base URL:', import.meta.env.VITE_API_BASE_URL);
  console.log('🗣️ Current Language:', localStorage.getItem('i18nextLng') || 'en');
  
  // Performance monitoring in dev
  const startTime = performance.now();
  window.addEventListener('load', () => {
    const loadTime = performance.now() - startTime;
    console.log(`⚡ App loaded in ${loadTime.toFixed(2)}ms`);
  });
}

// ================================
// ANALYTICS & PERFORMANCE MONITORING
// ================================

// Initialize analytics (production only)
if (import.meta.env.PROD && import.meta.env.VITE_ANALYTICS_ID) {
  initializeAnalytics(import.meta.env.VITE_ANALYTICS_ID);
}

// ================================
// HELPER FUNCTIONS
// ================================

async function logErrorToService(errorData) {
  try {
    // Replace with your error reporting service
    if (import.meta.env.VITE_SENTRY_DSN) {
      // Sentry.captureException(errorData);
    } else {
      // Fallback to custom endpoint
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      });
    }
  } catch (e) {
    // Silent fail - don't throw errors in error handler
    console.warn('Failed to log error to service:', e);
  }
}

function showUserFriendlyError(message) {
  // Create a simple toast notification
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #dc3545;
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 5000);
}

function showInstallPrompt() {
  // Show your custom install prompt UI
  // This would trigger your app's install banner component
  window.dispatchEvent(new CustomEvent('showInstallPrompt'));
}

function initializeAnalytics(analyticsId) {
  // Initialize your analytics service (Google Analytics, Plausible, etc.)
  // Example for GA4:
  // gtag('config', analyticsId);
}

function sendMetricToAnalytics(metric) {
  // Send performance metrics to your analytics service
  if (window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      custom_parameter_1: metric.id,
      custom_parameter_2: metric.name
    });
  }
}

// ================================
// APP RENDERING
// ================================

const root = ReactDOM.createRoot(document.getElementById('root'));

// Wrap with StrictMode in development only
const AppWithProviders = () => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingSpinner />}>
      <App />
    </Suspense>
  </ErrorBoundary>
);

const RootApp = import.meta.env.DEV ? (
  <React.StrictMode>
    <AppWithProviders />
  </React.StrictMode>
) : (
  <AppWithProviders />
);

root.render(RootApp);

// ================================
// TESTING UTILITIES
// ================================

// Expose testing utilities in development
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  window.__APP_TEST_UTILS__ = {
    clearPatientData: () => {
      Object.keys(localStorage)
        .filter(key => key.startsWith('patient-'))
        .forEach(key => localStorage.removeItem(key));
    },
    seedTestData: () => {
      // Add test patient data for development
      const testPatient = {
        id: 'test-001',
        name: 'Test Patient',
        dateOfBirth: '1990-01-01',
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('patient-test-001', JSON.stringify(testPatient));
    },
    getAppState: () => ({
      version: import.meta.env.VITE_APP_VERSION,
      environment: import.meta.env.MODE,
      language: localStorage.getItem('i18nextLng'),
      patientCount: Object.keys(localStorage).filter(k => k.startsWith('patient-')).length
    })
  };
  console.log('🧪 Test utilities available at window.__APP_TEST_UTILS__');

}
