// App.js
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { savePatientData, loadPatientData } from './storage';

function App() {
  const [name, setName] = useState('');
  const { t, i18n } = useTranslation();
  const patientId = 'patient-001';

  useEffect(() => {
    const fetchData = async () => {
      const savedData = await loadPatientData(patientId);
      if (savedData && savedData.name) {
        setName(savedData.name);
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    await savePatientData(patientId, { name });
    alert(t('savedAlert'));
  };

  return (
    <div style={{ padding: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
  <button onClick={() => i18n.changeLanguage('en')}>English</button>
  <button onClick={() => i18n.changeLanguage('es')}>Español</button>
</div>

      <h2>{t('formTitle')}</h2>
      <label>
          {t('nameLabel')}:
        <input
  type="text"
  id="patientName"
  name="patientName"
  value={name}
  onChange={(e) => setName(e.target.value)}
/>

      </label>
      <br /><br />
      <button onClick={handleSave}>{t('saveButton')}</button>
    </div>
  );
}

export default App;
