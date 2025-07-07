import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const ImportPatientData = () => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [state, setState] = useState({
    selectedFile: null,
    fileInfo: null,
    isImporting: false,
    lastImport: null,
    error: null
  });

  // Auto-clear success state after 5 seconds
  useEffect(() => {
    if (state.lastImport) {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, lastImport: null }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.lastImport]);

  // Validate individual patient record (matches export validation)
  const validatePatientRecord = (record, index) => {
    if (!record || typeof record !== 'object') {
      return { isValid: false, error: 'invalidFormat', index };
    }

    // Required field validation
    if (!record.id || typeof record.id !== 'string' || record.id.trim() === '') {
      return { isValid: false, error: 'missingId', index, id: record.id || 'unknown' };
    }

    if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
      return { isValid: false, error: 'missingName', index, id: record.id };
    }

    if (!record.dateCreated || typeof record.dateCreated !== 'string' || record.dateCreated.trim() === '') {
      return { isValid: false, error: 'missingDateCreated', index, id: record.id };
    }

    // Validate ID format (alphanumeric)
    if (!/^[a-zA-Z0-9]+$/.test(record.id.trim())) {
      return { isValid: false, error: 'invalidIdFormat', index, id: record.id };
    }

    // Optional fields validation (if present)
    const optionalFields = ['notes', 'language', 'gender'];
    for (const field of optionalFields) {
      if (record[field] !== undefined && typeof record[field] !== 'string') {
        return { isValid: false, error: `invalid${field.charAt(0).toUpperCase() + field.slice(1)}Format`, index, id: record.id };
      }
    }

    return { isValid: true, record: { ...record }, index, id: record.id };
  };

  // Check localStorage quota
  const checkStorageQuota = (estimatedSize) => {
    try {
      // Rough localStorage usage check
      const used = JSON.stringify(localStorage).length;
      const availableEstimate = 5 * 1024 * 1024; // Assume ~5MB limit (varies by browser)
      const usagePercent = (used / availableEstimate) * 100;
      
      if (usagePercent > 80) {
        return {
          warning: true,
          message: t('import.storageWarning', {
            percent: Math.round(usagePercent),
            defaultValue: `Storage is ${Math.round(usagePercent)}% full. Import may fail.`
          })
        };
      }
      return { warning: false };
    } catch (error) {
      return { warning: false }; // If we can't check, proceed anyway
    }
  };

  // Validate file structure and content
  const validateImportFile = (fileContent) => {
    let parsedData;
    
    // Parse JSON
    try {
      parsedData = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(t('import.invalidJson', { 
        defaultValue: 'Invalid JSON file format.' 
      }));
    }

    // Check for malicious structure depth/size
    const jsonString = JSON.stringify(parsedData);
    if (jsonString.length > 25 * 1024 * 1024) { // 25MB JSON string limit
      throw new Error(t('import.fileTooLarge', { 
        defaultValue: 'File content is too large to process safely.' 
      }));
    }

    // Validate required structure
    if (!parsedData.metadata || !parsedData.patients) {
      throw new Error(t('import.invalidStructure', { 
        defaultValue: 'File must contain metadata and patients sections.' 
      }));
    }

    // Validate schema version
    if (parsedData.metadata.schemaVersion !== '1.0') {
      throw new Error(t('import.incompatibleSchema', {
        version: parsedData.metadata.schemaVersion,
        defaultValue: `Incompatible schema version: ${parsedData.metadata.schemaVersion}. Expected: 1.0`
      }));
    }

    // Validate patients array
    if (!Array.isArray(parsedData.patients)) {
      throw new Error(t('import.invalidPatientsArray', { 
        defaultValue: 'Patients section must be an array.' 
      }));
    }

    // Log metadata mismatches (but don't block)
    if (parsedData.metadata.recordCount !== parsedData.patients.length) {
      console.warn('Metadata record count mismatch:', {
        expected: parsedData.metadata.recordCount,
        actual: parsedData.patients.length
      });
    }

    return parsedData;
  };

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    
    if (!file) {
      setState(prev => ({ ...prev, selectedFile: null, fileInfo: null, error: null }));
      return;
    }

    // Validate file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setState(prev => ({ 
        ...prev, 
        selectedFile: null, 
        fileInfo: null,
        error: t('import.invalidFileType', { 
          defaultValue: 'Please select a .json file.' 
        })
      }));
      return;
    }

    // Validate file size
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > 20) {
      setState(prev => ({ 
        ...prev, 
        selectedFile: null, 
        fileInfo: null,
        error: t('import.fileTooLarge', { 
          size: sizeInMB.toFixed(1),
          defaultValue: `File is too large (${sizeInMB.toFixed(1)}MB). Maximum allowed is 20MB.` 
        })
      }));
      return;
    }

    // Read file to get record count for display
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const parsedData = JSON.parse(content);
        
        setState(prev => ({
          ...prev,
          selectedFile: file,
          fileInfo: {
            name: file.name,
            size: sizeInMB.toFixed(2),
            recordCount: parsedData.patients ? parsedData.patients.length : 0,
            hasWarning: sizeInMB > 10
          },
          error: null
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          selectedFile: file,
          fileInfo: {
            name: file.name,
            size: sizeInMB.toFixed(2),
            recordCount: 'Unknown',
            hasWarning: true
          },
          error: t('import.previewError', { 
            defaultValue: 'Could not preview file contents.' 
          })
        }));
      }
    };
    reader.readAsText(file);
  };

  // Check for existing patient IDs
  const checkForConflicts = (patients) => {
    const conflicts = [];
    const existingKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('patient-')
    );
    
    patients.forEach((patient, index) => {
      if (existingKeys.includes(`patient-${patient.id}`)) {
        conflicts.push({ index, id: patient.id, name: patient.name });
      }
    });
    
    return conflicts;
  };

  // Main import handler
  const handleImport = async () => {
    if (!state.selectedFile) {
      setState(prev => ({ 
        ...prev, 
        error: t('import.noFileSelected', { defaultValue: 'Please select a file to import.' })
      }));
      return;
    }

    setState(prev => ({ ...prev, isImporting: true, error: null }));

    try {
      // Read file
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(state.selectedFile);
      });

      // Validate file structure and content
      const importData = validateImportFile(fileContent);
      const { patients, metadata } = importData;

      // Check storage quota
      const storageCheck = checkStorageQuota(fileContent.length);
      if (storageCheck.warning) {
        if (!window.confirm(storageCheck.message + ' Continue?')) {
          setState(prev => ({ ...prev, isImporting: false }));
          return;
        }
      }

      // Show confirmation dialog
      const confirmMessage = t('import.confirmDialog', {
        count: patients.length,
        defaultValue: `You're about to import ${patients.length} patient records. Continue?`
      });

      if (!window.confirm(confirmMessage)) {
        setState(prev => ({ ...prev, isImporting: false }));
        return;
      }

      // Check for conflicts
      const conflicts = checkForConflicts(patients);
      let overwriteAll = false;

      if (conflicts.length > 0) {
        const overwriteMessage = t('import.overwriteConfirm', {
          count: conflicts.length,
          defaultValue: `${conflicts.length} existing records will be replaced. Continue?`
        });
        
        overwriteAll = window.confirm(overwriteMessage);
        if (!overwriteAll) {
          setState(prev => ({ ...prev, isImporting: false }));
          return;
        }
      }

      // Process all records
      const results = {
        attempted: patients.length,
        imported: 0,
        skipped: 0,
        overwritten: 0,
        skippedRecords: []
      };

      const importTimestamp = new Date().toISOString();
      const importSource = state.selectedFile.name;

      patients.forEach((patient, index) => {
        const validation = validatePatientRecord(patient, index);
        
        if (!validation.isValid) {
          results.skipped++;
          results.skippedRecords.push({
            id: validation.id,
            index: validation.index,
            error: validation.error
          });
          console.warn(`Skipping invalid patient record at index ${index}:`, validation.error);
          return;
        }

        // Prepare record for storage
        const recordToStore = {
          ...validation.record,
          lastImported: importTimestamp,
          importSource: importSource
        };

        // Remove any unexpected fields (security measure)
        const allowedFields = ['id', 'name', 'dateCreated', 'notes', 'language', 'gender', 'lastImported', 'importSource'];
        const cleanedRecord = {};
        allowedFields.forEach(field => {
          if (recordToStore[field] !== undefined) {
            cleanedRecord[field] = recordToStore[field];
          }
        });

        const storageKey = `patient-${cleanedRecord.id}`;
        const existed = localStorage.getItem(storageKey) !== null;

        try {
          localStorage.setItem(storageKey, JSON.stringify(cleanedRecord));
          results.imported++;
          if (existed) {
            results.overwritten++;
          }
        } catch (storageError) {
          results.skipped++;
          results.skippedRecords.push({
            id: cleanedRecord.id,
            index,
            error: 'storageError'
          });
          console.error(`Failed to store patient ${cleanedRecord.id}:`, storageError);
        }
      });

      // Clear file input on successful import
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setState(prev => ({
        ...prev,
        isImporting: false,
        selectedFile: null,
        fileInfo: null,
        lastImport: {
          timestamp: importTimestamp,
          ...results
        },
        error: null
      }));

    } catch (error) {
      console.error('Import failed:', error);
      setState(prev => ({
        ...prev,
        isImporting: false,
        error: error.message
      }));
    }
  };

  return (
    <div style={{ 
      marginTop: '2rem', 
      padding: '1rem', 
      border: '1px solid #ddd', 
      borderRadius: '4px',
      maxWidth: '600px'
    }}>
      <h3 style={{ margin: '0 0 1rem 0' }}>
        {t('import.title', { defaultValue: 'Import Patient Data' })}
      </h3>
      
      <p style={{ margin: '0 0 1rem 0', color: '#666' }}>
        {t('import.description', { 
          defaultValue: 'Upload a JSON file exported from this application to import patient records.'
        })}
      </p>

      {/* File Input */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          disabled={state.isImporting}
          style={{
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            width: '100%',
            cursor: state.isImporting ? 'not-allowed' : 'pointer'
          }}
          aria-label={t('import.fileInputLabel', { 
            defaultValue: 'Select JSON file to import' 
          })}
        />
      </div>

      {/* File Info Display */}
      {state.fileInfo && (
        <div style={{ 
          marginBottom: '1rem', 
          padding: '0.75rem', 
          backgroundColor: state.fileInfo.hasWarning ? '#fff3cd' : '#d1ecf1',
          border: `1px solid ${state.fileInfo.hasWarning ? '#ffeaa7' : '#bee5eb'}`,
          borderRadius: '4px',
          fontSize: '0.9rem'
        }}>
          <p style={{ margin: 0 }}>
            📁 <strong>{state.fileInfo.name}</strong> ({state.fileInfo.size} MB)
          </p>
          <p style={{ margin: '0.25rem 0 0 0' }}>
            📊 {t('import.recordsFound', {
              count: state.fileInfo.recordCount,
              defaultValue: `${state.fileInfo.recordCount} patient records found`
            })}
          </p>
          {state.fileInfo.hasWarning && (
            <p style={{ margin: '0.25rem 0 0 0', color: '#856404' }}>
              ⚠️ {t('import.largeFileWarning', { 
                defaultValue: 'Large file - import may take a moment' 
              })}
            </p>
          )}
        </div>
      )}

      {/* Import Button */}
      <button 
        onClick={handleImport}
        disabled={state.isImporting || !state.selectedFile}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: state.isImporting || !state.selectedFile 
            ? '#ccc' 
            : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: state.isImporting || !state.selectedFile 
            ? 'not-allowed' 
            : 'pointer',
          fontSize: '1rem',
          fontWeight: '500'
        }}
        aria-label={t('import.buttonAriaLabel', { 
          defaultValue: 'Import selected patient data file' 
        })}
      >
        {state.isImporting 
          ? t('import.importing', { defaultValue: 'Importing...' })
          : t('import.button', { defaultValue: 'Import Patient Data' })
        }
      </button>

      {/* Success Message */}
      {state.lastImport && (
        <div style={{ 
          marginTop: '1rem', 
          padding: '0.75rem', 
          backgroundColor: '#d4edda', 
          border: '1px solid #c3e6cb', 
          borderRadius: '4px' 
        }}>
          <p style={{ margin: 0, color: '#155724', fontWeight: '500' }}>
            ✅ {t('import.success', { defaultValue: 'Import completed successfully!' })}
          </p>
          <p style={{ margin: '0.5rem 0 0 0', color: '#155724', fontSize: '0.9rem' }}>
            {t('import.successDetails', {
              imported: state.lastImport.imported,
              attempted: state.lastImport.attempted,
              overwritten: state.lastImport.overwritten,
              defaultValue: `${state.lastImport.imported} of ${state.lastImport.attempted} records imported${state.lastImport.overwritten > 0 ? ` (${state.lastImport.overwritten} overwritten)` : ''}`
            })}
          </p>
          
          {state.lastImport.skipped > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ margin: 0, color: '#856404', fontSize: '0.9rem' }}>
                ⚠️ {t('import.skippedRecords', {
                  count: state.lastImport.skipped,
                  defaultValue: `${state.lastImport.skipped} record(s) were skipped due to validation errors:`
                })}
              </p>
              <ul style={{ margin: '0.25rem 0 0 1rem', fontSize: '0.8rem', color: '#856404' }}>
                {state.lastImport.skippedRecords.slice(0, 5).map((record, index) => (
                  <li key={index}>
                    ID: {record.id} - {t(`import.error.${record.error}`, { 
                      defaultValue: record.error 
                    })}
                  </li>
                ))}
                {state.lastImport.skippedRecords.length > 5 && (
                  <li>...and {state.lastImport.skippedRecords.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div style={{ 
          marginTop: '1rem', 
          padding: '0.75rem', 
          backgroundColor: '#f8d7da', 
          border: '1px solid #f5c6cb', 
          borderRadius: '4px' 
        }}>
          <p style={{ margin: 0, color: '#721c24', fontWeight: '500' }}>
            ❌ {t('import.error', { defaultValue: 'Import failed:' })} {state.error}
          </p>
        </div>
      )}
    </div>
  );
};

export default ImportPatientData;