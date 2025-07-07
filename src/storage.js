// storage.js
import localforage from 'localforage';

// Save patient data using async IndexedDB (via localforage)
export const savePatientData = async (patientId, data) => {
  try {
    await localforage.setItem(`patient-${patientId}`, data);
    console.log(`✅ Saved data for ${patientId}`);
  } catch (error) {
    console.error('❌ Error saving patient data:', error);
    throw new Error('Unable to save patient data.');
  }
};

// Load patient data
export const loadPatientData = async (patientId) => {
  try {
    const data = await localforage.getItem(`patient-${patientId}`);
    console.log(`✅ Loaded data for ${patientId}:`, data);
    return data;
  } catch (error) {
    console.error('❌ Error loading patient data:', error);
    return null;
  }
};
