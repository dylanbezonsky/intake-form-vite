import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const ExportPatientData = () => {
  const { t } = useTranslation();
  const [state, setState] = useState({
    isExporting: false,
    availableRecords: 0,
    lastExport: null,
    error: null
  });

  // Count available records on mount and update
  useEffect(() => {
    const countRecords = () => {
      const patientKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('patient-')
      );
      setState(prev => ({ ...prev, availableRecords: patientKeys.length }));
    };

    countRecords();
    // Re-count if localStorage changes (though this is basic)
    window.addEventListener('storage', countRecords);
    return () => window.removeEventListener('storage', countRecords);
  }, []);

  // Auto-clear success state after 5 seconds
  useEffect(() => {
    if (state.lastExport) {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, lastExport: null }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.lastExport]);

  // Validate individual patient record
  const validatePatientRecord = (record, key) => {
    if (!record || typeof record !== 'object') {
      return { isValid: false, error: 'invalidFormat' };
    }

    // Required field validation
    if (!record.id || typeof record.id !== 'string' || record.id.trim() === '') {
      return { isValid: false, error: 'missingId' };
    }

    if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
      return { isValid: false, error: 'missingName' };
    }

    if (!record.dateCreated || typeof record.dateCreated !== 'string' || record.dateCreated.trim() === '') {
      return { isValid: false, error: 'missingDateCreated' };
    }

    // Validate ID format (alphanumeric)
    if (!/^[a-zA-Z0-9]+$/.test(record.id.trim())) {
      return { isValid: false, error: 'invalidIdFormat' };
    }

    // Optional fields validation (if present)
    const optionalFields = ['notes', 'language', 'gender'];
    for (const field of optionalFields) {
      if (record[field] !== undefined && typeof record[field] !== 'string') {
        return { isValid: false, error: `invalid${field.charAt(0).toUpperCase() + field.slice(1)}Format` };
      }
    }

    return { isValid: true, record };
  };

  // Generate timestamped filename
  const generateFilename = () => {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, ''); // Remove milliseconds
    
    return `patient_export_${timestamp}.json`;
  };

  // Calculate file size estimate
  const estimateFileSize = (data) => {
    const jsonString = JSON.stringify(data, null, 2);
    const sizeInBytes = new Blob([jsonString]).size;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    return { sizeInBytes, sizeInMB };
  };

  // Main export handler
  const handleExport = async () => {
    // Check if records available
    if (state.availableRecords === 0) {
      setState(prev => ({ 
        ...prev, 
        error: t('export.noData', { defaultValue: 'No patient data available to export.' })
      }));
      return;
    }

    // Show confirmation dialog
    const confirmMessage = t('export.confirmDialog', { 
      count: state.availableRecords,
      defaultValue: `Are you sure you want to export all ${state.availableRecords} patient records?`
    });
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setState(prev => ({ ...prev, isExporting: true, error: null }));

    try {
      // Get all patient keys
      const patientKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('patient-')
      );

      // Warn if approaching limits
      if (patientKeys.length > 500) {
        const proceedMessage = t('export.largeDatasetWarning', {
          count: patientKeys.length,
          defaultValue: `Warning: Exporting ${patientKeys.length} records. This may take a moment. Continue?`
        });
        if (!window.confirm(proceedMessage)) {
          setState(prev => ({ ...prev, isExporting: false }));
          return;
        }
      }

      // Process all records
      const validPatients = [];
      const invalidRecords = [];

      for (const key of patientKeys) {
        try {
          const rawData = localStorage.getItem(key);
          if (!rawData) {
            invalidRecords.push({ key, error: 'emptyData' });
            continue;
          }

          const parsedData = JSON.parse(rawData);
          const validation = validatePatientRecord(parsedData, key);
          
          if (validation.isValid) {
            validPatients.push(validation.record);
          } else {
            invalidRecords.push({ key, error: validation.error });
            console.warn(`Invalid patient record ${key}:`, validation.error);
          }
        } catch (parseError) {
          invalidRecords.push({ key, error: 'parseError', details: parseError.message });
          console.error(`Failed to parse ${key}:`, parseError);
        }
      }

      // Create export data structure
      const exportData = {
        metadata: {
          exportTimestamp: new Date().toISOString(),
          recordCount: validPatients.length,
          schemaVersion: '1.0',
          totalAttempted: patientKeys.length,
          invalidRecords: invalidRecords.length
        },
        patients: validPatients
      };

      // Check file size before download
      const { sizeInMB } = estimateFileSize(exportData);
      
      if (sizeInMB > 20) {
        throw new Error(t('export.fileTooLarge', {
          size: sizeInMB.toFixed(1),
          defaultValue: `Export file is too large (${sizeInMB.toFixed(1)}MB). Maximum allowed is 20MB.`
        }));
      }

      if (sizeInMB > 10) {
        const proceedMessage = t('export.largeFileWarning', {
          size: sizeInMB.toFixed(1),
          defaultValue: `Warning: Export file is ${sizeInMB.toFixed(1)}MB. Continue with download?`
        });
        if (!window.confirm(proceedMessage)) {
          setState(prev => ({ ...prev, isExporting: false }));
          return;
        }
      }

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = generateFilename();
      link.setAttribute('aria-label', t('export.downloadLink', { 
        defaultValue: 'Download patient data export file' 
      }));
      
      // Required for Firefox
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Update success state
      setState(prev => ({
        ...prev,
        isExporting: false,
        lastExport: {
          timestamp: new Date().toISOString(),
          validRecords: validPatients.length,
          invalidRecords: invalidRecords.length,
          totalRecords: patientKeys.length,
          fileSize: sizeInMB.toFixed(2)
        },
        error: null
      }));

    } catch (error) {
      console.error('Export failed:', error);
      setState(prev => ({
        ...prev,
        isExporting: false,
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
        {t('export.title', { defaultValue: 'Export Patient Data' })}
      </h3>
      
      <p style={{ margin: '0 0 1rem 0', color: '#666' }}>
        {t('export.description', { 
          defaultValue: 'Download all patient records as a JSON file for backup or data transfer.'
        })}
      </p>

      {/* Record Count Display */}
      <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#555' }}>
        {state.availableRecords > 0 ? (
          <span>
            📊 {t('export.recordsAvailable', {
              count: state.availableRecords,
              defaultValue: `${state.availableRecords} patient records ready for export`
            })}
          </span>
        ) : (
          <span style={{ color: '#888' }}>
            {t('export.noRecordsFound', { defaultValue: 'No patient records found' })}
          </span>
        )}
      </div>

      {/* Export Button */}
      <button 
        onClick={handleExport}
        disabled={state.isExporting || state.availableRecords === 0}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: state.isExporting || state.availableRecords === 0 
            ? '#ccc' 
            : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: state.isExporting || state.availableRecords === 0 
            ? 'not-allowed' 
            : 'pointer',
          fontSize: '1rem',
          fontWeight: '500'
        }}
        aria-label={t('export.buttonAriaLabel', { 
          defaultValue: 'Export all patient data to JSON file' 
        })}
      >
        {state.isExporting 
          ? t('export.exporting', { defaultValue: 'Exporting...' })
          : t('export.button', { defaultValue: 'Export Patient Data' })
        }
      </button>

      {/* Success Message */}
      {state.lastExport && (
        <div style={{ 
          marginTop: '1rem', 
          padding: '0.75rem', 
          backgroundColor: '#d4edda', 
          border: '1px solid #c3e6cb', 
          borderRadius: '4px' 
        }}>
          <p style={{ margin: 0, color: '#155724', fontWeight: '500' }}>
            ✅ {t('export.success', { defaultValue: 'Export completed successfully!' })}
          </p>
          <p style={{ margin: '0.5rem 0 0 0', color: '#155724', fontSize: '0.9rem' }}>
            {t('export.successDetails', {
              valid: state.lastExport.validRecords,
              total: state.lastExport.totalRecords,
              size: state.lastExport.fileSize,
              defaultValue: `${state.lastExport.validRecords} of ${state.lastExport.totalRecords} records exported (${state.lastExport.fileSize} MB)`
            })}
          </p>
          
          {state.lastExport.invalidRecords > 0 && (
            <p style={{ margin: '0.5rem 0 0 0', color: '#856404', fontSize: '0.9rem' }}>
              ⚠️ {t('export.invalidRecordsWarning', {
                count: state.lastExport.invalidRecords,
                defaultValue: `${state.lastExport.invalidRecords} invalid record(s) were excluded from export`
              })}
            </p>
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
            ❌ {t('export.error', { defaultValue: 'Export failed:' })} {state.error}
          </p>
        </div>
      )}
    </div>
  );
};

export default ExportPatientData;