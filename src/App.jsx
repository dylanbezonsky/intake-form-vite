// App.jsx - Global-Scale Medical App with Offline-First Architecture
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast, ToastContainer } from 'react-toastify';
import { v4 as uuidv4 } from 'uuid';
import 'react-toastify/dist/ReactToastify.css';

import { SecureStorage } from './services/secureStorage';
import ErrorBoundary from './components/ErrorBoundary';
import ExportPatientData from './components/ExportPatientData';
import ImportPatientData from './components/ImportPatientData';
import Login from './components/Login';
import Signup from './components/Signup';

// Separate Components for Clean Architecture
const LanguageSwitcher = ({ currentLanguage, onLanguageChange }) => {
  const { t } = useTranslation();
  
  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => onLanguageChange('en')}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          currentLanguage === 'en'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
        aria-label={t('switchToEnglish', { defaultValue: 'Switch to English' })}
      >
        English
      </button>
      <button
        onClick={() => onLanguageChange('es')}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          currentLanguage === 'es'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
        aria-label={t('switchToSpanish', { defaultValue: 'Cambiar a Español' })}
      >
        Español
      </button>
    </div>
  );
};

const PatientSelector = ({ patients, selectedPatientId, onPatientSelect, onNewPatient }) => {
  const { t } = useTranslation();
  
  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-3">
        {t('patientSelector', { defaultValue: 'Patient Selection' })}
      </h3>
      
      <div className="flex flex-wrap gap-2 mb-3">
        {patients.map((patientId) => (
          <button
            key={patientId}
            onClick={() => onPatientSelect(patientId)}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              selectedPatientId === patientId
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {patientId.slice(-8)} {/* Show last 8 chars of UUID */}
          </button>
        ))}
      </div>
      
      <button
        onClick={onNewPatient}
        className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors"
      >
        + {t('newPatient', { defaultValue: 'New Patient' })}
      </button>
    </div>
  );
};

const LoadingSpinner = ({ message }) => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
    <span className="text-gray-600">{message}</span>
  </div>
);

function App() {
  const { t, i18n } = useTranslation();
  const formRef = useRef(null);
  
// User Authentication State
const [hasUsers, setHasUsers] = useState(false);
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [currentUser, setCurrentUser] = useState(null);
const [showSignup, setShowSignup] = useState(false);
  // State Management
  const [appState, setAppState] = useState({
    isLoading: false,
    isSaving: false,
    hasUnsavedChanges: false,
    lastSavedAt: null,
    errorLogs: []
  });
  
  const [allPatients, setAllPatients] = useState([]);
  const [currentPatientId, setCurrentPatientId] = useState(null);
  const [patientCache, setPatientCache] = useState(new Map());
  
  // Form Data - Extensible Schema
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: '',
    symptoms: '',
    // Prepared for future fields:
    // clinicId: '',
    // medicalHistory: '',
    // medications: '',
    // emergencyContact: ''
  });

  // Generate new patient ID
  const generatePatientId = () => {
    // In production: consider clinic prefix, e.g., 'CLINIC_001_' + uuidv4()
    return uuidv4();
  };

  // Error logging system
  const logError = (error, context) => {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    setAppState(prev => ({
      ...prev,
      errorLogs: [...prev.errorLogs.slice(-49), errorEntry] // Keep last 50 errors
    }));
    
    console.error('App Error:', errorEntry);
  };

// Check if any users exist on app start
useEffect(() => {
  const checkUserStatus = () => {
    const storedUsers = JSON.parse(localStorage.getItem('registered_users') || '{}');
    const userCount = Object.keys(storedUsers).length;
    setHasUsers(userCount > 0);
    setShowSignup(userCount === 0); // Show signup if no users exist
  };
  
  checkUserStatus();
}, []);

// Login Handler
const handleLogin = (userData) => {
  setCurrentUser(userData);
  SecureStorage.setCurrentPin(userData.password); // Use password for encryption
  setIsAuthenticated(true);
  toast.success(t('loginSuccess', { defaultValue: `Welcome back, ${userData.username}!` }));
};

// Signup Handler
const handleSignup = (userData) => {
  setCurrentUser(userData);
  SecureStorage.setCurrentPin(userData.password); // Use password for encryption
  setHasUsers(true);
  setIsAuthenticated(true);
  toast.success(t('accountCreated', { defaultValue: `Account created! Welcome, ${userData.username}!` }));
};

// Switch between login and signup
const handleSwitchToSignup = () => setShowSignup(true);
const handleSwitchToLogin = () => setShowSignup(false);
  
// Load all patient IDs on app start
  useEffect(() => {
    const loadAllPatients = async () => {
      setAppState(prev => ({ ...prev, isLoading: true }));
      
      try {
        const patientIds = await SecureStorage.getAllPatientIds();
        setAllPatients(patientIds);
        
        // Auto-select first patient if available
        if (patientIds.length > 0 && !currentPatientId) {
          setCurrentPatientId(patientIds[0]);
        }
      } catch (error) {
        logError(error, 'loadAllPatients');
        toast.error(t('errorLoadingPatients', { 
          defaultValue: 'Failed to load patient list' 
        }));
      } finally {
        setAppState(prev => ({ ...prev, isLoading: false }));
      }
    };
    
    loadAllPatients();
  }, []);

  // Load patient data when currentPatientId changes
  useEffect(() => {
    if (!currentPatientId) return;
    
    const loadCurrentPatient = async () => {
      setAppState(prev => ({ ...prev, isLoading: true }));
      
      try {
        // Check cache first
        if (patientCache.has(currentPatientId)) {
          const cachedData = patientCache.get(currentPatientId);
          setFormData(cachedData.patientInfo || {});
          setAppState(prev => ({ 
            ...prev, 
            isLoading: false,
            lastSavedAt: cachedData.updatedAt 
          }));
          return;
        }
        
        // Load from storage
        const savedData = await SecureStorage.loadPatientData(currentPatientId);
        if (savedData) {
          setFormData(savedData.patientInfo || {});
          setPatientCache(prev => new Map(prev).set(currentPatientId, savedData));
          setAppState(prev => ({ 
            ...prev, 
            lastSavedAt: savedData.updatedAt,
            hasUnsavedChanges: false 
          }));
        } else {
          // New patient - reset form
          setFormData({
            name: '',
            age: '',
            gender: '',
            symptoms: ''
          });
          setAppState(prev => ({ 
            ...prev, 
            lastSavedAt: null,
            hasUnsavedChanges: false 
          }));
        }
      } catch (error) {
        logError(error, 'loadCurrentPatient');
        toast.error(t('errorLoadingPatient', { 
          defaultValue: 'Failed to load patient data' 
        }));
      } finally {
        setAppState(prev => ({ ...prev, isLoading: false }));
      }
    };
    
    loadCurrentPatient();
  }, [currentPatientId]);

  // Track unsaved changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setAppState(prev => ({ ...prev, hasUnsavedChanges: true }));
  };

  // Form validation
  const validateForm = () => {
    const errors = [];
    
    if (!formData.name?.trim()) {
      errors.push(t('nameRequired', { defaultValue: 'Patient name is required' }));
    }
    
    if (formData.age && (isNaN(formData.age) || formData.age < 0 || formData.age > 150)) {
      errors.push(t('ageInvalid', { defaultValue: 'Please enter a valid age' }));
    }
    
    return errors;
  };

  // Save patient data
  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!currentPatientId) {
      toast.error(t('noPatientSelected', { defaultValue: 'No patient selected' }));
      return;
    }
    
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    
    setAppState(prev => ({ ...prev, isSaving: true }));
    
    try {
      const patientRecord = {
        id: currentPatientId,
        createdAt: patientCache.get(currentPatientId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        patientInfo: { ...formData },
        metadata: {
          version: 1,
          lastModifiedBy: 'current-user', // TODO: Replace with actual user ID
          deviceInfo: navigator.userAgent
        }
      };
      
      await SecureStorage.savePatientData(currentPatientId, patientRecord);
      
      // Update cache
      setPatientCache(prev => new Map(prev).set(currentPatientId, patientRecord));
      
      setAppState(prev => ({
        ...prev,
        isSaving: false,
        hasUnsavedChanges: false,
        lastSavedAt: patientRecord.updatedAt
      }));
      
      toast.success(t('dataSaved', { defaultValue: 'Patient data saved successfully!' }));
      
    } catch (error) {
      logError(error, 'handleSave');
      setAppState(prev => ({ ...prev, isSaving: false }));
      toast.error(t('saveFailed', { 
        defaultValue: 'Failed to save patient data. Please try again.' 
      }));
    }
  };

  // New patient handler
  const handleNewPatient = () => {
    if (appState.hasUnsavedChanges) {
      const shouldContinue = window.confirm(
        t('unsavedChangesWarning', { 
          defaultValue: 'You have unsaved changes. Continue without saving?' 
        })
      );
      if (!shouldContinue) return;
    }
    
    const newId = generatePatientId();
    setAllPatients(prev => [...prev, newId]);
    setCurrentPatientId(newId);
  };

  // Language change handler
  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    toast.info(t('languageChanged', { defaultValue: 'Language changed' }));
  };

  // Warn about unsaved changes on page unload
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (appState.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [appState.hasUnsavedChanges]);

// Authentication Flow
if (!hasUsers || showSignup) {
  return (
    <ErrorBoundary>
      <Signup 
        onSignup={handleSignup}
        onSwitchToLogin={handleSwitchToLogin}
      />
    </ErrorBoundary>
  );
}

if (!isAuthenticated) {
  return (
    <ErrorBoundary>
      <Login 
        onLogin={handleLogin}
        onSwitchToSignup={handleSwitchToSignup}
      />
    </ErrorBoundary>
  );
}
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
          
         {/* Header with Logout */}
        <header className="border-b border-gray-200 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('appTitle', { defaultValue: 'Medical Intake System' })}
              </h1>
              {currentUser && (
                <p className="text-sm text-gray-600 mt-1">
                  Logged in as: <span className="font-medium">{currentUser.username}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <LanguageSwitcher 
                currentLanguage={i18n.language}
                onLanguageChange={handleLanguageChange}
              />
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setCurrentUser(null);
                  SecureStorage.setCurrentPin(null);
                  toast.info(t('loggedOut', { defaultValue: 'Logged out successfully' }));
                }}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

          {/* Patient Selection */}
          <PatientSelector
            patients={allPatients}
            selectedPatientId={currentPatientId}
            onPatientSelect={setCurrentPatientId}
            onNewPatient={handleNewPatient}
          />

          {/* Loading State */}
          {appState.isLoading && (
            <LoadingSpinner 
              message={t('loadingPatient', { defaultValue: 'Loading patient data...' })}
            />
          )}

          {/* Patient Form */}
          {!appState.isLoading && currentPatientId && (
            <form ref={formRef} onSubmit={handleSave} className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('patientForm', { defaultValue: 'Patient Information' })}
              </h2>

              {/* Name Field */}
              <div>
                <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('nameLabel', { defaultValue: 'Full Name' })} *
                </label>
                <input
                  type="text"
                  id="patientName"
                  name="patientName"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-describedby="nameHelp"
                  placeholder={t('namePlaceholder', { defaultValue: 'Enter patient full name' })}
                />
                <p id="nameHelp" className="text-sm text-gray-600 mt-1">
                  {t('nameHelp', { defaultValue: 'Required field for patient identification' })}
                </p>
              </div>

              {/* Age Field */}
              <div>
                <label htmlFor="patientAge" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('ageLabel', { defaultValue: 'Age' })}
                </label>
                <input
                  type="number"
                  id="patientAge"
                  name="patientAge"
                  min="0"
                  max="150"
                  value={formData.age}
                  onChange={(e) => handleInputChange('age', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('agePlaceholder', { defaultValue: 'Enter age in years' })}
                />
              </div>

              {/* Gender Field */}
              <div>
                <label htmlFor="patientGender" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('genderLabel', { defaultValue: 'Gender' })}
                </label>
                <select
                  id="patientGender"
                  name="patientGender"
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('selectGender', { defaultValue: 'Select gender' })}</option>
                  <option value="male">{t('male', { defaultValue: 'Male' })}</option>
                  <option value="female">{t('female', { defaultValue: 'Female' })}</option>
                  <option value="other">{t('other', { defaultValue: 'Other' })}</option>
                  <option value="prefer-not-to-say">{t('preferNotToSay', { defaultValue: 'Prefer not to say' })}</option>
                </select>
              </div>

              {/* Symptoms Field */}
              <div>
                <label htmlFor="patientSymptoms" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('symptomsLabel', { defaultValue: 'Symptoms / Chief Complaint' })}
                </label>
                <textarea
                  id="patientSymptoms"
                  name="patientSymptoms"
                  rows="4"
                  value={formData.symptoms}
                  onChange={(e) => handleInputChange('symptoms', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('symptomsPlaceholder', { defaultValue: 'Describe current symptoms or reason for visit' })}
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center space-x-4">
                  <button
                    type="submit"
                    disabled={appState.isSaving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {appState.isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                        {t('saving', { defaultValue: 'Saving...' })}
                      </>
                    ) : (
                      t('saveButton', { defaultValue: 'Save Patient Data' })
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        name: '',
                        age: '',
                        gender: '',
                        symptoms: ''
                      });
                      setAppState(prev => ({ ...prev, hasUnsavedChanges: false }));
                    }}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md font-medium hover:bg-gray-400 transition-colors"
                  >
                    {t('resetForm', { defaultValue: 'Reset Form' })}
                  </button>
                </div>

                {/* Status Indicators */}
                <div className="text-sm text-gray-600">
                  {appState.hasUnsavedChanges && (
                    <span className="text-orange-600 font-medium">
                      • {t('unsavedChanges', { defaultValue: 'Unsaved changes' })}
                    </span>
                  )}
                  {appState.lastSavedAt && !appState.hasUnsavedChanges && (
                    <span className="text-green-600">
                      ✓ {t('lastSaved', { defaultValue: 'Last saved' })}: {' '}
                      {new Date(appState.lastSavedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </form>
          )}

          {/* Data Management Section */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('dataManagement', { defaultValue: 'Data Management' })}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ExportPatientData />
              <ImportPatientData />
            </div>
          </div>

        </div>

        {/* Toast Container */}
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;