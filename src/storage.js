// storage.js - Production-Grade Medical Data Storage Infrastructure
import localforage from 'localforage';

// ================================
// CONFIGURATION & CONSTANTS
// ================================

const CONFIG = {
  DB_NAME: 'ClinicPatientDB',
  DB_VERSION: 1.0,
  STORE_NAME: 'patients',
  SCHEMA_VERSION: '1.0',
  DEBUG: import.meta.env.DEV,
  CACHE_SIZE: 100, // LRU cache limit
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // ms
  STORAGE_WARNING_THRESHOLD: 0.8, // 80% of quota
  STORAGE_ERROR_THRESHOLD: 0.95, // 95% of quota
  BACKUP_ENABLED: true,
  COMPRESSION_ENABLED: false, // Future feature
  TTL_DEFAULT: 365 * 24 * 60 * 60 * 1000, // 1 year in ms
};

// Error codes for standardized error handling
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  DATA_CORRUPTION: 'DATA_CORRUPTION',
  NETWORK_ERROR: 'NETWORK_ERROR',
  FALLBACK_ACTIVATED: 'FALLBACK_ACTIVATED',
  MIGRATION_ERROR: 'MIGRATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// ================================
// STORAGE ABSTRACTION LAYER
// ================================

class StorageService {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.cache = new Map(); // LRU cache
    this.cacheAccessOrder = []; // For LRU tracking
    this.listeners = new Map(); // Event listeners
    this.metrics = {
      operations: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTime: 0
    };
    
    // Initialize storage backend
    this._initializeStorage();
    this._setupErrorHandling();
  }

  /**
   * Initialize localforage with custom configuration
   * @private
   */
  _initializeStorage() {
    try {
      localforage.config({
        name: this.config.DB_NAME,
        version: this.config.DB_VERSION,
        storeName: this.config.STORE_NAME,
        description: 'Patient data storage for clinic intake system'
      });
      
      this._log('info', 'Storage initialized successfully', { 
        driver: localforage.driver(),
        config: this.config 
      });
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to initialize storage', error);
    }
  }

  /**
   * Setup global error handling and fallback detection
   * @private
   */
  _setupErrorHandling() {
    // Listen for quota exceeded errors
    window.addEventListener('error', (event) => {
      if (event.message && event.message.includes('QuotaExceededError')) {
        this._handleError('STORAGE_QUOTA_EXCEEDED', 'Storage quota exceeded', event.error);
      }
    });
  }

  // ================================
  // CORE CRUD OPERATIONS
  // ================================

  /**
   * Save patient data with validation and backup
   * @param {string} patientId - Unique patient identifier
   * @param {Object} data - Patient data object
   * @param {Object} options - Save options (backup, validate, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async savePatientData(patientId, data, options = {}) {
    const startTime = performance.now();
    
    try {
      // Input validation
      if (!patientId || typeof patientId !== 'string') {
        throw this._createError('VALIDATION_ERROR', 'Patient ID is required and must be string');
      }

      // Validate patient data schema
      const validatedData = this._validatePatientData(data);
      
      // Add metadata
      const enrichedData = this._enrichPatientData(validatedData, patientId, 'save');
      
      // Check storage quota before save
      await this._checkStorageQuota();
      
      // Backup existing data if enabled
      if (this.config.BACKUP_ENABLED && options.backup !== false) {
        await this._backupExistingData(patientId);
      }
      
      // Save to storage with retry logic
      const key = this._generateKey(patientId);
      await this._retryOperation(async () => {
        await localforage.setItem(key, enrichedData);
      });
      
      // Update cache
      this._updateCache(key, enrichedData);
      
      // Emit save event
      this._emit('save', { patientId, data: enrichedData });
      
      this._log('info', `✅ Saved patient data: ${patientId}`);
      this._recordMetrics(startTime, 'save', true);
      
      return true;
      
    } catch (error) {
      this._recordMetrics(startTime, 'save', false);
      
      // Try fallback to localStorage
      if (await this._tryLocalStorageFallback('save', patientId, data)) {
        return true;
      }
      
      this._handleError(error.code || 'UNKNOWN_ERROR', `Failed to save patient ${patientId}`, error);
      throw error;
    }
  }

  /**
   * Load patient data with caching
   * @param {string} patientId - Patient identifier
   * @param {Object} options - Load options (useCache, etc.)
   * @returns {Promise<Object|null>} Patient data or null if not found
   */
  async loadPatientData(patientId, options = {}) {
    const startTime = performance.now();
    
    try {
      if (!patientId || typeof patientId !== 'string') {
        throw this._createError('VALIDATION_ERROR', 'Patient ID is required and must be string');
      }

      const key = this._generateKey(patientId);
      
      // Check cache first
      if (options.useCache !== false && this.cache.has(key)) {
        this._updateCacheAccess(key);
        this._recordMetrics(startTime, 'load', true, true);
        this._log('debug', `🎯 Cache hit for patient: ${patientId}`);
        return this.cache.get(key);
      }
      
      // Load from storage
      const data = await this._retryOperation(async () => {
        return await localforage.getItem(key);
      });
      
      if (data) {
        // Validate data integrity
        const validatedData = this._validateStoredData(data, patientId);
        
        // Update cache
        this._updateCache(key, validatedData);
        
        // Update access metadata
        const updatedData = this._enrichPatientData(validatedData, patientId, 'access');
        await localforage.setItem(key, updatedData);
        
        this._emit('load', { patientId, data: validatedData });
        this._log('debug', `✅ Loaded patient data: ${patientId}`);
        this._recordMetrics(startTime, 'load', true, false);
        
        return validatedData;
      }
      
      this._log('debug', `ℹ️ Patient not found: ${patientId}`);
      this._recordMetrics(startTime, 'load', true, false);
      
      return null;
      
    } catch (error) {
      this._recordMetrics(startTime, 'load', false);
      
      // Try fallback to localStorage
      const fallbackData = await this._tryLocalStorageFallback('load', patientId);
      if (fallbackData) {
        return fallbackData;
      }
      
      this._handleError(error.code || 'UNKNOWN_ERROR', `Failed to load patient ${patientId}`, error);
      return null; // Don't throw on load failure, return null
    }
  }

  /**
   * Update existing patient data
   * @param {string} patientId - Patient identifier
   * @param {Object} updates - Partial update object
   * @param {Object} options - Update options
   * @returns {Promise<boolean>} Success status
   */
  async updatePatientData(patientId, updates, options = {}) {
    try {
      // Load existing data
      const existingData = await this.loadPatientData(patientId);
      if (!existingData) {
        throw this._createError('VALIDATION_ERROR', `Patient ${patientId} not found for update`);
      }
      
      // Merge updates with existing data
      const mergedData = { ...existingData, ...updates };
      
      // Save updated data
      return await this.savePatientData(patientId, mergedData, options);
      
    } catch (error) {
      this._handleError(error.code || 'UNKNOWN_ERROR', `Failed to update patient ${patientId}`, error);
      throw error;
    }
  }

  /**
   * Delete patient data
   * @param {string} patientId - Patient identifier
   * @param {Object} options - Delete options (backup, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async deletePatientData(patientId, options = {}) {
    const startTime = performance.now();
    
    try {
      if (!patientId || typeof patientId !== 'string') {
        throw this._createError('VALIDATION_ERROR', 'Patient ID is required and must be string');
      }

      const key = this._generateKey(patientId);
      
      // Backup before delete if enabled
      if (this.config.BACKUP_ENABLED && options.backup !== false) {
        await this._backupExistingData(patientId);
      }
      
      // Remove from storage
      await this._retryOperation(async () => {
        await localforage.removeItem(key);
      });
      
      // Remove from cache
      this.cache.delete(key);
      this._removeFromCacheOrder(key);
      
      // Emit delete event
      this._emit('delete', { patientId });
      
      this._log('info', `🗑️ Deleted patient data: ${patientId}`);
      this._recordMetrics(startTime, 'delete', true);
      
      return true;
      
    } catch (error) {
      this._recordMetrics(startTime, 'delete', false);
      this._handleError(error.code || 'UNKNOWN_ERROR', `Failed to delete patient ${patientId}`, error);
      throw error;
    }
  }

  // ================================
  // BATCH OPERATIONS
  // ================================

  /**
   * Save multiple patients in batch
   * @param {Array} patients - Array of {id, data} objects
   * @param {Object} options - Batch save options
   * @returns {Promise<Object>} Results summary
   */
  async saveMultiplePatients(patients, options = {}) {
    const startTime = performance.now();
    const results = {
      total: patients.length,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    try {
      this._log('info', `📦 Starting batch save of ${patients.length} patients`);
      
      // Process in chunks to prevent memory issues
      const chunkSize = options.chunkSize || 50;
      
      for (let i = 0; i < patients.length; i += chunkSize) {
        const chunk = patients.slice(i, i + chunkSize);
        
        await Promise.allSettled(
          chunk.map(async ({ id, data }) => {
            try {
              await this.savePatientData(id, data, { backup: false }); // Skip individual backups in batch
              results.successful++;
            } catch (error) {
              results.failed++;
              results.errors.push({ id, error: error.message });
              this._log('warn', `Failed to save patient in batch: ${id}`, error);
            }
          })
        );
        
        // Emit progress event
        this._emit('batchProgress', {
          processed: Math.min(i + chunkSize, patients.length),
          total: patients.length,
          successful: results.successful,
          failed: results.failed
        });
      }
      
      this._emit('batchSave', results);
      this._log('info', `✅ Batch save completed: ${results.successful}/${results.total} successful`);
      this._recordMetrics(startTime, 'batchSave', true);
      
      return results;
      
    } catch (error) {
      this._recordMetrics(startTime, 'batchSave', false);
      this._handleError('UNKNOWN_ERROR', 'Batch save operation failed', error);
      throw error;
    }
  }

  /**
   * Load all patient data
   * @param {Object} options - Load options (useCache, filters, etc.)
   * @returns {Promise<Object>} Map of patientId -> data
   */
  async loadAllPatients(options = {}) {
    const startTime = performance.now();
    
    try {
      const patients = {};
      
      // Get all patient keys
      const keys = await localforage.keys();
      const patientKeys = keys.filter(key => key.startsWith('patient-'));
      
      this._log('info', `📚 Loading ${patientKeys.length} patients`);
      
      // Load in chunks to prevent memory issues
      const chunkSize = options.chunkSize || 100;
      
      for (let i = 0; i < patientKeys.length; i += chunkSize) {
        const chunk = patientKeys.slice(i, i + chunkSize);
        
        const chunkResults = await Promise.allSettled(
          chunk.map(async (key) => {
            const patientId = key.replace('patient-', '');
            const data = await this.loadPatientData(patientId, { useCache: false });
            return { patientId, data };
          })
        );
        
        // Process results
        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.data) {
            patients[result.value.patientId] = result.value.data;
          }
        });
        
        // Emit progress
        this._emit('loadProgress', {
          processed: Math.min(i + chunkSize, patientKeys.length),
          total: patientKeys.length
        });
      }
      
      this._emit('loadAll', { count: Object.keys(patients).length });
      this._log('info', `✅ Loaded ${Object.keys(patients).length} patients`);
      this._recordMetrics(startTime, 'loadAll', true);
      
      return patients;
      
    } catch (error) {
      this._recordMetrics(startTime, 'loadAll', false);
      this._handleError('UNKNOWN_ERROR', 'Failed to load all patients', error);
      throw error;
    }
  }

  /**
   * Delete all patient data
   * @param {Object} options - Delete options (backup, confirm, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async deleteAllPatients(options = {}) {
    const startTime = performance.now();
    
    try {
      // Safety check - require explicit confirmation
      if (!options.confirmed) {
        throw this._createError('VALIDATION_ERROR', 'deleteAllPatients requires explicit confirmation');
      }
      
      // Backup all data if enabled
      if (this.config.BACKUP_ENABLED && options.backup !== false) {
        this._log('info', '💾 Creating backup before mass deletion');
        const allPatients = await this.loadAllPatients();
        await this._createBackup('mass_delete', allPatients);
      }
      
      // Get all patient keys
      const keys = await localforage.keys();
      const patientKeys = keys.filter(key => key.startsWith('patient-'));
      
      this._log('warn', `🗑️ Deleting ${patientKeys.length} patients`);
      
      // Delete all patient data
      await Promise.all(
        patientKeys.map(key => localforage.removeItem(key))
      );
      
      // Clear cache
      this.cache.clear();
      this.cacheAccessOrder.length = 0;
      
      this._emit('deleteAll', { deletedCount: patientKeys.length });
      this._log('info', `✅ Deleted ${patientKeys.length} patients`);
      this._recordMetrics(startTime, 'deleteAll', true);
      
      return true;
      
    } catch (error) {
      this._recordMetrics(startTime, 'deleteAll', false);
      this._handleError('UNKNOWN_ERROR', 'Failed to delete all patients', error);
      throw error;
    }
  }

  // ================================
  // QUERY & SEARCH OPERATIONS
  // ================================

  /**
   * Count total number of patients
   * @returns {Promise<number>} Patient count
   */
  async countPatients() {
    try {
      const keys = await localforage.keys();
      const count = keys.filter(key => key.startsWith('patient-')).length;
      this._log('debug', `📊 Patient count: ${count}`);
      return count;
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to count patients', error);
      return 0;
    }
  }

  /**
   * Search patients by criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Search options (limit, offset, etc.)
   * @returns {Promise<Array>} Matching patients
   */
  async searchPatients(criteria, options = {}) {
    try {
      const allPatients = await this.loadAllPatients();
      const results = [];
      const limit = options.limit || 100;
      const offset = options.offset || 0;
      
      for (const [patientId, data] of Object.entries(allPatients)) {
        if (this._matchesCriteria(data, criteria)) {
          results.push({ id: patientId, ...data });
        }
        
        if (results.length >= limit + offset) break;
      }
      
      const paginatedResults = results.slice(offset, offset + limit);
      
      this._log('debug', `🔍 Search found ${results.length} matches, returning ${paginatedResults.length}`);
      
      return {
        results: paginatedResults,
        total: results.length,
        limit,
        offset
      };
      
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to search patients', error);
      return { results: [], total: 0, limit: 0, offset: 0 };
    }
  }

  /**
   * Get patients by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} dateField - Date field to filter on (default: 'dateCreated')
   * @returns {Promise<Array>} Patients in date range
   */
  async getPatientsByDateRange(startDate, endDate, dateField = 'dateCreated') {
    try {
      const criteria = {
        [dateField]: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString()
        }
      };
      
      const result = await this.searchPatients(criteria);
      this._log('debug', `📅 Date range query found ${result.total} patients`);
      
      return result.results;
      
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to get patients by date range', error);
      return [];
    }
  }

  // ================================
  // MIGRATION & COMPATIBILITY
  // ================================

  /**
   * Migrate data from localStorage to IndexedDB
   * @param {Object} options - Migration options
   * @returns {Promise<Object>} Migration results
   */
  async migrateLocalStorageToIndexedDB(options = {}) {
    const startTime = performance.now();
    const results = {
      total: 0,
      migrated: 0,
      skipped: 0,
      errors: []
    };
    
    try {
      this._log('info', '🔄 Starting localStorage to IndexedDB migration');
      
      // Get all localStorage patient keys
      const localStorageKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('patient-')
      );
      
      results.total = localStorageKeys.length;
      
      if (results.total === 0) {
        this._log('info', 'ℹ️ No localStorage patient data found to migrate');
        return results;
      }
      
      for (const key of localStorageKeys) {
        try {
          // Check if already exists in IndexedDB
          const patientId = key.replace('patient-', '');
          const existingData = await this.loadPatientData(patientId);
          
          if (existingData && !options.overwrite) {
            results.skipped++;
            this._log('debug', `⏭️ Skipping existing patient: ${patientId}`);
            continue;
          }
          
          // Parse localStorage data
          const rawData = localStorage.getItem(key);
          const parsedData = JSON.parse(rawData);
          
          // Migrate to IndexedDB
          await this.savePatientData(patientId, parsedData, { backup: false });
          results.migrated++;
          
          // Remove from localStorage if successful and requested
          if (options.removeOriginal) {
            localStorage.removeItem(key);
          }
          
          this._log('debug', `✅ Migrated patient: ${patientId}`);
          
        } catch (error) {
          results.errors.push({ key, error: error.message });
          this._log('warn', `Failed to migrate patient: ${key}`, error);
        }
      }
      
      this._emit('migration', results);
      this._log('info', `✅ Migration completed: ${results.migrated}/${results.total} migrated`);
      this._recordMetrics(startTime, 'migration', true);
      
      return results;
      
    } catch (error) {
      this._recordMetrics(startTime, 'migration', false);
      this._handleError('MIGRATION_ERROR', 'Migration failed', error);
      throw error;
    }
  }

  // ================================
  // IMPORT/EXPORT INTEGRATION
  // ================================

  /**
   * Export all patients in standardized format
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export data
   */
  async exportPatients(options = {}) {
    try {
      const allPatients = await this.loadAllPatients();
      const patientArray = Object.entries(allPatients).map(([id, data]) => ({
        id,
        ...data
      }));
      
      const exportData = {
        metadata: {
          exportTimestamp: new Date().toISOString(),
          recordCount: patientArray.length,
          schemaVersion: this.config.SCHEMA_VERSION,
          source: 'StorageService',
          options
        },
        patients: patientArray
      };
      
      this._log('info', `📤 Exported ${patientArray.length} patients`);
      this._emit('export', { count: patientArray.length });
      
      return exportData;
      
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to export patients', error);
      throw error;
    }
  }

  /**
   * Import patients from standardized format
   * @param {Object} importData - Import data object
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import results
   */
  async importPatients(importData, options = {}) {
    try {
      // Validate import data structure
      if (!importData.metadata || !importData.patients) {
        throw this._createError('VALIDATION_ERROR', 'Invalid import data structure');
      }
      
      // Check schema compatibility
      if (importData.metadata.schemaVersion !== this.config.SCHEMA_VERSION) {
        this._log('warn', `Schema version mismatch: ${importData.metadata.schemaVersion} vs ${this.config.SCHEMA_VERSION}`);
      }
      
      // Prepare patients for batch save
      const patientsToSave = importData.patients.map(patient => ({
        id: patient.id,
        data: patient
      }));
      
      // Use batch save operation
      const results = await this.saveMultiplePatients(patientsToSave, options);
      
      this._log('info', `📥 Imported ${results.successful}/${results.total} patients`);
      this._emit('import', results);
      
      return results;
      
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to import patients', error);
      throw error;
    }
  }

  // ================================
  // UTILITY & HELPER METHODS
  // ================================

  /**
   * Get storage statistics and health info
   * @returns {Promise<Object>} Storage statistics
   */
  async getStorageStats() {
    try {
      const keys = await localforage.keys();
      const patientKeys = keys.filter(key => key.startsWith('patient-'));
      
      // Estimate storage usage
      let totalSize = 0;
      for (const key of patientKeys.slice(0, 10)) { // Sample for estimation
        const data = await localforage.getItem(key);
        totalSize += JSON.stringify(data).length;
      }
      const avgRecordSize = totalSize / Math.min(10, patientKeys.length);
      const estimatedTotalSize = avgRecordSize * patientKeys.length;
      
      const stats = {
        totalRecords: patientKeys.length,
        estimatedSizeBytes: estimatedTotalSize,
        estimatedSizeMB: (estimatedTotalSize / 1024 / 1024).toFixed(2),
        cacheSize: this.cache.size,
        cacheHitRate: this.metrics.operations > 0 
          ? (this.metrics.cacheHits / this.metrics.operations * 100).toFixed(1) + '%'
          : '0%',
        metrics: this.metrics,
        driver: localforage.driver(),
        config: this.config
      };
      
      this._log('debug', '📊 Storage statistics:', stats);
      
      return stats;
      
    } catch (error) {
      this._handleError('UNKNOWN_ERROR', 'Failed to get storage stats', error);
      return null;
    }
  }

  /**
   * Clear all caches and reset metrics
   */
  clearCache() {
    this.cache.clear();
    this.cacheAccessOrder.length = 0;
    this.metrics = {
      operations: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTime: 0
    };
    
    this._log('info', '🧹 Cache and metrics cleared');
    this._emit('cacheCleared');
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // ================================
  // PRIVATE HELPER METHODS
  // ================================

  /**
   * Generate storage key for patient
   * @param {string} patientId - Patient identifier
   * @returns {string} Storage key
   * @private
   */
  _generateKey(patientId) {
    return `patient-${patientId}`;
  }

  /**
   * Validate patient data against schema
   * @param {Object} data - Patient data
   * @returns {Object} Validated data
   * @private
   */
  _validatePatientData(data) {
    if (!data || typeof data !== 'object') {
      throw this._createError('VALIDATION_ERROR', 'Patient data must be an object');
    }

    // Required fields validation
    if (!data.id || typeof data.id !== 'string' || data.id.trim() === '') {
      throw this._createError('VALIDATION_ERROR', 'Patient ID is required and must be a non-empty string');
    }

    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      throw this._createError('VALIDATION_ERROR', 'Patient name is required and must be a non-empty string');
    }

    if (!data.dateCreated || typeof data.dateCreated !== 'string') {
      throw this._createError('VALIDATION_ERROR', 'Date created is required and must be a string');
    }

    // Validate ID format (alphanumeric)
    if (!/^[a-zA-Z0-9]+$/.test(data.id.trim())) {
      throw this._createError('VALIDATION_ERROR', 'Patient ID must be alphanumeric');
    }

    // Optional fields validation
    const optionalFields = ['notes', 'language', 'gender'];
    for (const field of optionalFields) {
      if (data[field] !== undefined && typeof data[field] !== 'string') {
        throw this._createError('VALIDATION_ERROR', `${field} must be a string if provided`);
      }
    }

    return data;
  }

  /**
   * Validate stored data integrity
   * @param {Object} data - Stored data
   * @param {string} patientId - Patient ID for context
   * @returns {Object} Validated data
   * @private
   */
  _validateStoredData(data, patientId) {
    if (!data || typeof data !== 'object') {
      throw this._createError('DATA_CORRUPTION', `Corrupted data for patient ${patientId}`);
    }

    // Check for required metadata
    if (!data.schemaVersion) {
      this._log('warn', `Missing schema version for patient ${patientId}`);
    }

    return data;
  }

  /**
   * Enrich patient data with metadata
   * @param {Object} data - Patient data
   * @param {string} patientId - Patient ID
   * @param {string} operation - Operation type (save, access, etc.)
   * @returns {Object} Enriched data
   * @private
   */
  _enrichPatientData(data, patientId, operation) {
    const now = new Date().toISOString();
    
    const enriched = {
      ...data,
      schemaVersion: this.config.SCHEMA_VERSION,
      metadata: {
        ...data.metadata,
        lastModified: operation === 'save' ? now : data.metadata?.lastModified,
        lastAccessed: now,
        accessCount: (data.metadata?.accessCount || 0) + (operation === 'access' ? 1 : 0)
      }
    };

    return enriched;
  }

  /**
   * Check storage quota and warn if approaching limits
   * @private
   */
  async _checkStorageQuota() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usageRatio = estimate.usage / estimate.quota;
        
        if (usageRatio > this.config.STORAGE_ERROR_THRESHOLD) {
          throw this._createError('STORAGE_QUOTA_EXCEEDED', 'Storage quota exceeded');
        }
        
        if (usageRatio > this.config.STORAGE_WARNING_THRESHOLD) {
          this._log('warn', `Storage usage at ${(usageRatio * 100).toFixed(1)}%`);
          this._emit('storageWarning', { usage: estimate.usage, quota: estimate.quota, ratio: usageRatio });
        }
      }
    } catch (error) {
      // Quota check failed, but don't block the operation
      this._log('warn', 'Failed to check storage quota', error);
    }
  }

  /**
   * Backup existing data before overwrite
   * @param {string} patientId - Patient ID
   * @private
   */
  async _backupExistingData(patientId) {
    try {
      const existingData = await this.loadPatientData(patientId, { useCache: false });
      if (existingData) {
        const backupKey = `backup-${patientId}-${Date.now()}`;
        await localforage.setItem(backupKey, existingData);
        this._log('debug', `💾 Created backup: ${backupKey}`);
      }
    } catch (error) {
      this._log('warn', `Failed to create backup for ${patientId}`, error);
    }
  }

  /**
   * Create comprehensive backup
   * @param {string} reason - Backup reason
   * @param {Object} data - Data to backup
   * @private
   */
  async _createBackup(reason, data) {
    try {
      const backupKey = `system-backup-${reason}-${Date.now()}`;
      const backupData = {
        timestamp: new Date().toISOString(),
        reason,
        data,
        metadata: {
          version: this.config.SCHEMA_VERSION,
          recordCount: Object.keys(data).length
        }
      };
      
      await localforage.setItem(backupKey, backupData);
      this._log('info', `💾 Created system backup: ${backupKey}`);
    } catch (error) {
      this._log('error', `Failed to create system backup for ${reason}`, error);
    }
  }

  /**
   * Update cache with LRU eviction
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @private
   */
  _updateCache(key, data) {
    // Remove if already exists
    if (this.cache.has(key)) {
      this._removeFromCacheOrder(key);
    }
    
    // Add to front of access order
    this.cacheAccessOrder.unshift(key);
    this.cache.set(key, data);
    
    // Evict oldest if over limit
    while (this.cache.size > this.config.CACHE_SIZE) {
      const oldestKey = this.cacheAccessOrder.pop();
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Update cache access order for LRU
   * @param {string} key - Cache key
   * @private
   */
  _updateCacheAccess(key) {
    this._removeFromCacheOrder(key);
    this.cacheAccessOrder.unshift(key);
    this.metrics.cacheHits++;
  }

  /**
   * Remove key from cache access order
   * @param {string} key - Cache key
   * @private
   */
  _removeFromCacheOrder(key) {
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
  }

  /**
   * Try localStorage fallback for operation
   * @param {string} operation - Operation type
   * @param {string} patientId - Patient ID
   * @param {Object} data - Data for save operations
   * @returns {Promise<any>} Operation result
   * @private
   */
  async _tryLocalStorageFallback(operation, patientId, data = null) {
    try {
      const key = this._generateKey(patientId);
      
      switch (operation) {
        case 'save':
          localStorage.setItem(key, JSON.stringify(data));
          this._emit('fallback', { operation, patientId, backend: 'localStorage' });
          this._log('warn', `💾 Fallback save to localStorage: ${patientId}`);
          return true;
          
        case 'load':
          const storedData = localStorage.getItem(key);
          if (storedData) {
            const parsed = JSON.parse(storedData);
            this._emit('fallback', { operation, patientId, backend: 'localStorage' });
            this._log('warn', `💾 Fallback load from localStorage: ${patientId}`);
            return parsed;
          }
          return null;
          
        default:
          return null;
      }
    } catch (error) {
      this._log('error', `Fallback ${operation} failed for ${patientId}`, error);
      return null;
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - Operation to retry
   * @param {number} attempt - Current attempt number
   * @returns {Promise<any>} Operation result
   * @private
   */
  async _retryOperation(operation, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.config.RETRY_ATTEMPTS) {
        throw error;
      }
      
      const delay = this.config.RETRY_DELAY * Math.pow(2, attempt - 1);
      this._log('warn', `Retrying operation (attempt ${attempt + 1}/${this.config.RETRY_ATTEMPTS}) after ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this._retryOperation(operation, attempt + 1);
    }
  }

  /**
   * Check if data matches search criteria
   * @param {Object} data - Patient data
   * @param {Object} criteria - Search criteria
   * @returns {boolean} Whether data matches
   * @private
   */
  _matchesCriteria(data, criteria) {
    for (const [field, value] of Object.entries(criteria)) {
      if (typeof value === 'object' && value !== null) {
        // Handle range queries
        if (value.$gte && data[field] < value.$gte) return false;
        if (value.$lte && data[field] > value.$lte) return false;
        if (value.$regex && !new RegExp(value.$regex, value.$flags).test(data[field])) return false;
      } else {
        // Exact match or substring
        if (typeof data[field] === 'string' && typeof value === 'string') {
          if (!data[field].toLowerCase().includes(value.toLowerCase())) return false;
        } else if (data[field] !== value) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Create standardized error object
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @returns {Error} Standardized error
   * @private
   */
  _createError(code, message, details = null) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.timestamp = new Date().toISOString();
    return error;
  }

  /**
   * Handle errors with logging and events
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Error} originalError - Original error
   * @private
   */
  _handleError(code, message, originalError = null) {
    const error = this._createError(code, message, originalError);
    
    this.metrics.errors++;
    this._log('error', message, { code, originalError });
    this._emit('error', error);
    
    return error;
  }

  /**
   * Record performance metrics
   * @param {number} startTime - Operation start time
   * @param {string} operation - Operation type
   * @param {boolean} success - Whether operation succeeded
   * @param {boolean} cacheHit - Whether this was a cache hit
   * @private
   */
  _recordMetrics(startTime, operation, success, cacheHit = false) {
    const duration = performance.now() - startTime;
    
    this.metrics.operations++;
    this.metrics.totalTime += duration;
    
    if (cacheHit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
    
    this._log('debug', `📊 ${operation}: ${duration.toFixed(2)}ms ${success ? '✅' : '❌'} ${cacheHit ? '(cache)' : ''}`);
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @private
   */
  _emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this._log('error', `Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Centralized logging with levels
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Log message
   * @param {Object} data - Additional log data
   * @private
   */
  _log(level, message, data = null) {
    if (!this.config.DEBUG && level === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      service: 'StorageService'
    };
    
    switch (level) {
      case 'error':
        console.error(`[${timestamp}] StorageService ERROR: ${message}`, data);
        break;
      case 'warn':
        console.warn(`[${timestamp}] StorageService WARN: ${message}`, data);
        break;
      case 'info':
        console.info(`[${timestamp}] StorageService INFO: ${message}`, data);
        break;
      case 'debug':
        console.debug(`[${timestamp}] StorageService DEBUG: ${message}`, data);
        break;
    }
    
    this._emit('log', logEntry);
  }
}

// ================================
// SINGLETON INSTANCE & EXPORTS
// ================================

// Create singleton instance
const storageService = new StorageService();

// Export individual functions for backwards compatibility
export const savePatientData = (patientId, data, options) => 
  storageService.savePatientData(patientId, data, options);

export const loadPatientData = (patientId, options) => 
  storageService.loadPatientData(patientId, options);

export const updatePatientData = (patientId, updates, options) => 
  storageService.updatePatientData(patientId, updates, options);

export const deletePatientData = (patientId, options) => 
  storageService.deletePatientData(patientId, options);

export const saveMultiplePatients = (patients, options) => 
  storageService.saveMultiplePatients(patients, options);

export const loadAllPatients = (options) => 
  storageService.loadAllPatients(options);

export const deleteAllPatients = (options) => 
  storageService.deleteAllPatients(options);

export const countPatients = () => 
  storageService.countPatients();

export const searchPatients = (criteria, options) => 
  storageService.searchPatients(criteria, options);

export const getPatientsByDateRange = (startDate, endDate, dateField) => 
  storageService.getPatientsByDateRange(startDate, endDate, dateField);

export const migrateLocalStorageToIndexedDB = (options) => 
  storageService.migrateLocalStorageToIndexedDB(options);

export const exportPatients = (options) => 
  storageService.exportPatients(options);

export const importPatients = (importData, options) => 
  storageService.importPatients(importData, options);

export const getStorageStats = () => 
  storageService.getStorageStats();

export const clearCache = () => 
  storageService.clearCache();

// Export the service instance for advanced usage
export { storageService };

// Export configuration and constants for testing
export { CONFIG, ERROR_CODES };

// Export default for convenience
export default storageService;

// Add this export at the bottom with the other exports
export const getAllPatientIds = async () => {
  try {
    const keys = await localforage.keys();
    return keys.filter(key => key.startsWith('patient-')).map(key => key.replace('patient-', ''));
  } catch (error) {
    console.error('Failed to get patient IDs:', error);
    return [];
  }
};