import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';
import React from 'react';

function BrokenComponent() {
  throw new Error('Crash!');
}

test('shows fallback UI when a child throws', () => {
  render(
    <ErrorBoundary>
      <BrokenComponent />
    </ErrorBoundary>
  );
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
});
