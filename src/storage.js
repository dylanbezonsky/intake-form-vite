// storage.js
import localforage from "localforage";

// Save patient data under a specific key
export const savePatientData = async (patientId, data) => {
  try {
    await localforage.setItem(patientId, data);
    console.log(`Saved data for ${patientId}`);
  } catch (error) {
    console.error("Error saving patient data:", error);
  }
};

// Load patient data
export const loadPatientData = async (patientId) => {
  try {
    const data = await localforage.getItem(patientId);
    console.log(`Loaded data for ${patientId}:`, data);
    return data;
  } catch (error) {
    console.error("Error loading patient data:", error);
    return null;
  }
};
