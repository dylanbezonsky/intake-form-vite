import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { loadAllPatients, countPatients } from '../storage';

const ExportPatientData = () => {
  const { t } = useTranslation();
  const [state, setState] = useState({
    isExporting: false,
    availableRecords: 0,
    lastExport: null,
    error: null,
    isLoading: true
  });

  // Count available records on mount and update
  useEffect(() => {
    const loadRecordCount = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true }));
        const count = await countPatients();
        setState(prev => ({ 
          ...prev, 
          availableRecords: count,
          isLoading: false 
        }));
      } catch (error) {
        console.error('Failed to count patients:', error);
        setState(prev => ({ 
          ...prev, 
          availableRecords: 0,
          isLoading: false,
          error: 'Failed to load patient count'
        }));
      }
    };

    loadRecordCount();
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
  const validatePatientRecord = (record, patientId) => {
    if (!record || typeof record !== 'object') {
      return { isValid: false, error: 'invalidFormat' };
    }

    // Required field validation
    if (!record.id || typeof record.id !== 'string' || record.id.trim() === '') {
      return { isValid: false, error: 'missingId' };
    }

    // For App.jsx structure, check patientInfo nested object
    const patientInfo = record.patientInfo || record;
    
    if (!patientInfo.name || typeof patientInfo.name !== 'string' || patientInfo.name.trim() === '') {
      return { isValid: false, error: 'missingName' };
    }

    if (!record.createdAt && !record.dateCreated) {
      return { isValid: false, error: 'missingDateCreated' };
    }

    // Validate ID format (allow more flexible format for UUIDs)
    if (!/^[a-zA-Z0-9\-_]+$/.test(record.id.trim())) {
      return { isValid: false, error: 'invalidIdFormat' };
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
      // Load all patient data using new storage system
      const allPatients = await loadAllPatients();
      const patientEntries = Object.entries(allPatients);

      // Warn if approaching limits
      if (patientEntries.length > 500) {
        const proceedMessage = t('export.largeDatasetWarning', {
          count: patientEntries.length,
          defaultValue: `Warning: Exporting ${patientEntries.length} records. This may take a moment. Continue?`
        });
        if (!window.confirm(proceedMessage)) {
          setState(prev => ({ ...prev, isExporting: false }));
          return;
        }
      }

      // Process all records
      const validPatients = [];
      const invalidRecords = [];

      for (const [patientId, patientData] of patientEntries) {
        try {
          if (!patientData) {
            invalidRecords.push({ patientId, error: 'emptyData' });
            continue;
          }

          const validation = validatePatientRecord(patientData, patientId);
          
          if (validation.isValid) {
            // Ensure the exported record has the patient ID
            const exportRecord = {
              ...validation.record,
              id: patientId,
              // Flatten structure for easier import/export
              ...(validation.record.patientInfo && {
                name: validation.record.patientInfo.name,
                age: validation.record.patientInfo.age,
                gender: validation.record.patientInfo.gender,
                symptoms: validation.record.patientInfo.symptoms
              })
            };
            
            validPatients.push(exportRecord);
          } else {
            invalidRecords.push({ patientId, error: validation.error });
            console.warn(`Invalid patient record ${patientId}:`, validation.error);
          }
        } catch (processError) {
          invalidRecords.push({ 
            patientId, 
            error: 'processError', 
            details: processError.message 
          });
          console.error(`Failed to process ${patientId}:`, processError);
        }
      }

      // Create export data structure
      const exportData = {
        metadata: {
          exportTimestamp: new Date().toISOString(),
          recordCount: validPatients.length,
          schemaVersion: '1.0',
          totalAttempted: patientEntries.length,
          invalidRecords: invalidRecords.length,
          exportedBy: 'Medical Intake System',
          storageSystem: 'IndexedDB'
        },
        patients: validPatients,
        ...(invalidRecords.length > 0 && {
          exportWarnings: {
            message: 'Some records were invalid and excluded from export',
            invalidRecords: invalidRecords.map(({ patientId, error }) => ({ patientId, error }))
          }
        })
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
          totalRecords: patientEntries.length,
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

  // Refresh record count manually
  const handleRefreshCount = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const count = await countPatients();
      setState(prev => ({ 
        ...prev, 
        availableRecords: count,
        isLoading: false,
        error: null
      }));
    } catch (error) {
      console.error('Failed to refresh count:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        error: 'Failed to refresh patient count'
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
      <div style={{ 
        marginBottom: '1rem', 
        fontSize: '0.9rem', 
        color: '#555',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        {state.isLoading ? (
          <span>🔄 {t('export.loadingCount', { defaultValue: 'Loading patient count...' })}</span>
        ) : state.availableRecords > 0 ? (
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
        
        <button
          onClick={handleRefreshCount}
          disabled={state.isLoading}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '3px',
            cursor: 'pointer',
            color: '#495057'
          }}
          title={t('export.refreshTooltip', { defaultValue: 'Refresh patient count' })}
        >
          🔄
        </button>
      </div>

      {/* Export Button */}
      <button 
        onClick={handleExport}
        disabled={state.isExporting || state.availableRecords === 0 || state.isLoading}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: state.isExporting || state.availableRecords === 0 || state.isLoading
            ? '#ccc' 
            : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: state.isExporting || state.availableRecords === 0 || state.isLoading
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