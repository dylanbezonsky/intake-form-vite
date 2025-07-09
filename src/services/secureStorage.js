import Dexie from 'dexie';
import { encrypt, decrypt } from './encryption.js';

// Define the database schema
class PatientDatabase extends Dexie {
  constructor() {
    super('SecurePatientDB');
    this.version(1).stores({
      patients: '++id, patientId, encryptedData, timestamp, syncStatus, deviceId',
      auditLogs: '++id, action, timestamp, patientId, details',
      settings: 'key, value'
    });
  }
}

const db = new PatientDatabase();

// Secure Storage Service
export class SecureStorage {
  static currentPin = null;
  
  // Set the current PIN for encryption/decryption
  static setCurrentPin(pin) {
    this.currentPin = pin;
  }
  
  // Get device ID for tracking
  static async getDeviceId() {
    let deviceRecord = await db.settings.get('device_id');
    if (!deviceRecord) {
      deviceRecord = {
        key: 'device_id',
        value: crypto.randomUUID()
      };
      await db.settings.put(deviceRecord);
    }
    return deviceRecord.value;
  }
  
  // Save patient data with encryption
  static async savePatientData(patientId, patientRecord) {
    if (!this.currentPin) {
      throw new Error('PIN not set - cannot encrypt data');
    }
    
    try {
      // Encrypt the entire patient record
      const encryptedData = await encrypt(JSON.stringify(patientRecord), this.currentPin);
      
      // Create database record
      const dbRecord = {
        patientId: patientId,
        encryptedData: JSON.stringify(encryptedData),
        timestamp: Date.now(),
        syncStatus: 'local',
        deviceId: await this.getDeviceId()
      };
      
      // Save to IndexedDB
      await db.patients.put(dbRecord);
      
      // Add audit log
      await this.addAuditLog('SAVE_PATIENT', patientId, {
        action: 'Patient data saved',
        timestamp: new Date().toISOString()
      });
      
      return patientId;
      
    } catch (error) {
      console.error('Failed to save patient data:', error);
      throw new Error(`Save failed: ${error.message}`);
    }
  }
  
  // Load patient data with decryption
  static async loadPatientData(patientId) {
    if (!this.currentPin) {
      throw new Error('PIN not set - cannot decrypt data');
    }
    
    try {
      // Find the patient record
      const dbRecord = await db.patients.where('patientId').equals(patientId).first();
      
      if (!dbRecord) {
        return null; // Patient not found
      }
      
      // Decrypt the data
      const encryptedData = JSON.parse(dbRecord.encryptedData);
      const decryptedString = await decrypt(encryptedData, this.currentPin);
      const patientRecord = JSON.parse(decryptedString);
      
      // Add audit log
      await this.addAuditLog('LOAD_PATIENT', patientId, {
        action: 'Patient data loaded',
        timestamp: new Date().toISOString()
      });
      
      return patientRecord;
      
    } catch (error) {
      console.error('Failed to load patient data:', error);
      throw new Error(`Load failed: ${error.message}`);
    }
  }
  
  // Get all patient IDs (without decrypting data)
  static async getAllPatientIds() {
    try {
      const records = await db.patients.orderBy('timestamp').reverse().toArray();
      return records.map(record => record.patientId);
    } catch (error) {
      console.error('Failed to get patient IDs:', error);
      throw new Error(`Failed to get patient list: ${error.message}`);
    }
  }
  
  // Delete patient data
  static async deletePatientData(patientId) {
    if (!this.currentPin) {
      throw new Error('PIN not set - cannot delete data');
    }
    
    try {
      // Delete from database
      await db.patients.where('patientId').equals(patientId).delete();
      
      // Add audit log
      await this.addAuditLog('DELETE_PATIENT', patientId, {
        action: 'Patient data deleted',
        timestamp: new Date().toISOString()
      });
      
      return true;
      
    } catch (error) {
      console.error('Failed to delete patient data:', error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  }
  
  // Export all patient data (encrypted)
  static async exportAllData() {
    if (!this.currentPin) {
      throw new Error('PIN not set - cannot export data');
    }
    
    try {
      const records = await db.patients.toArray();
      const auditLogs = await db.auditLogs.toArray();
      
      // Decrypt all patient records for export
      const decryptedRecords = [];
      for (const record of records) {
        try {
          const encryptedData = JSON.parse(record.encryptedData);
          const decryptedString = await decrypt(encryptedData, this.currentPin);
          const patientRecord = JSON.parse(decryptedString);
          
          decryptedRecords.push({
            patientId: record.patientId,
            data: patientRecord,
            timestamp: record.timestamp,
            syncStatus: record.syncStatus
          });
        } catch (decryptError) {
          console.error(`Failed to decrypt patient ${record.patientId}:`, decryptError);
        }
      }
      
      const exportData = {
        patients: decryptedRecords,
        auditLogs: auditLogs,
        exportedAt: new Date().toISOString(),
        deviceId: await this.getDeviceId()
      };
      
      // Add audit log
      await this.addAuditLog('EXPORT_DATA', null, {
        action: 'Data exported',
        patientCount: decryptedRecords.length,
        timestamp: new Date().toISOString()
      });
      
      return exportData;
      
    } catch (error) {
      console.error('Failed to export data:', error);
      throw new Error(`Export failed: ${error.message}`);
    }
  }
  
  // Add audit log entry
  static async addAuditLog(action, patientId, details) {
    try {
      await db.auditLogs.add({
        action: action,
        timestamp: Date.now(),
        patientId: patientId,
        details: details
      });
    } catch (error) {
      console.error('Failed to add audit log:', error);
    }
  }
  
  // Get audit logs
  static async getAuditLogs(limit = 100) {
    try {
      return await db.auditLogs
        .orderBy('timestamp')
        .reverse()
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  }
  
  // Clear all data (for testing or reset)
  static async clearAllData() {
    try {
      await db.patients.clear();
      await db.auditLogs.clear();
      // Don't clear settings (keeps device ID)
      
      await this.addAuditLog('CLEAR_DATA', null, {
        action: 'All data cleared',
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error(`Clear failed: ${error.message}`);
    }
  }
}