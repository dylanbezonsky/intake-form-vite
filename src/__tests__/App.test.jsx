import '../i18n'; // 👈 Import real i18n config

import { render, screen } from '@testing-library/react';

import App from '../App';
import TestWrapper from './TestWrapper';

test('renders patient intake form title', () => {
  render(
    <TestWrapper>
      <App />
    </TestWrapper>
  );
  expect(screen.getByText(/Patient Intake Form/i)).toBeInTheDocument();
});
