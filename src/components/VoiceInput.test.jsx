import { render, screen } from '@testing-library/react';
import VoiceInput from './VoiceInput';
import TestWrapper from '../__tests__/TestWrapper';

test('renders speak button', () => {
  render(
    <TestWrapper>
      <VoiceInput />
    </TestWrapper>
  );
  expect(screen.getByRole('button')).toHaveTextContent(/speak/i);
});
