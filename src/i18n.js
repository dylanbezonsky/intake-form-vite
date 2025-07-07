import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
<<<<<<< HEAD
import en from '../public/locales/en/translation.json';
import es from '../public/locales/es/translation.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    debug: false,
=======
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: true,
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}/translation.json', // must point to public/locales
    },
>>>>>>> 85384ef288867ca1492a340dc0779ef22daec69c
  });

export default i18n;
