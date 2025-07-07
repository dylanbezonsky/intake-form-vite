import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const VoiceInput = ({ onResult }) => {
  const [listening, setListening] = useState(false);
  const { t, i18n } = useTranslation();

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const handleStart = () => {
    if (!SpeechRecognition) {
      alert(t('speechUnsupported'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = i18n.language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => console.error('Speech error', e);

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      if (onResult) onResult(spokenText);
    };

    recognition.start();
  };

  return (
    <div>
      <button onClick={handleStart} disabled={listening}>
        {listening ? t('listening') : t('speak')}
      </button>
    </div>
  );
};

export default VoiceInput;
