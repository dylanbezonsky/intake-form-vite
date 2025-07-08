import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en/translation.json';
import es from './locales/es/translation.json';

// Initialize i18next with gold standard configuration
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    
    // Language detection configuration
    detection: {
      // Define order and strategies for language detection
      order: ['localStorage', 'navigator', 'htmlTag'],
      
      // Cache detected language in localStorage
      caches: ['localStorage'],
      
      // localStorage key to store language
      lookupLocalStorage: 'i18nextLng',
      
      // Don't lookup from subdomain/path
      checkWhitelist: false
    },
    
    // Fallback settings
    lng: 'en', // Default language if detection fails
    fallbackLng: 'en',
    
    // Interpolation settings
    interpolation: {
      escapeValue: false, // React already escapes
    },
    
    // Development settings
    debug: import.meta.env.DEV, // Only debug in development
    
    // React settings
    react: {
      useSuspense: false, // Disable suspense for better error handling
    },
    
    // Performance settings
    load: 'languageOnly', // Load 'en' instead of 'en-US'
    cleanCode: true, // Clean language codes
    
    // Namespace settings
    defaultNS: 'translation',
    ns: ['translation'],
    
    // Missing key handling
    missingKeyHandler: (lng, ns, key, fallbackValue) => {
      if (import.meta.env.DEV) {
        console.warn(`Missing translation key: ${key} for language: ${lng}`);
      }
    },
    
    // Save missing keys (development only)
    saveMissing: import.meta.env.DEV,
    
    // Return empty string for missing keys instead of the key itself
    returnEmptyString: false,
    returnNull: false,
    
    // Key separator (set to false to allow dots in keys)
    keySeparator: '.',
    nsSeparator: ':',
  });

// Set HTML lang attribute when language changes
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  
  // Log language change in development
  if (import.meta.env.DEV) {
    console.log(`🌍 Language changed to: ${lng}`);
  }
});

// Initialize HTML lang attribute
document.documentElement.lang = i18n.language || 'en';

export default i18n;