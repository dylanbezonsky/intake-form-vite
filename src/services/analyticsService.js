let analyticsInitialized = false;

export const initializeAnalytics = (analyticsId) => {
  if (analyticsInitialized || !analyticsId) return;
  
  // Placeholder for analytics initialization
  console.log('Analytics initialized:', analyticsId);
  analyticsInitialized = true;
};

export const sendMetricToAnalytics = (metric) => {
  if (!analyticsInitialized) return;
  console.log('Metric sent:', metric);
};