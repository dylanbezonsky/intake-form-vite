import React from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n'; // your actual i18n.js config file

const TestWrapper = ({ children }) => {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export default TestWrapper;
