import React, { useState } from 'react';

export default function Login({ onLogin, onSwitchToSignup }) {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field, value) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    if (error) setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validate inputs
    if (!credentials.username.trim()) {
      setError('Username is required');
      setIsLoading(false);
      return;
    }

    if (!credentials.password) {
      setError('Password is required');
      setIsLoading(false);
      return;
    }

    try {
      // Check if user exists and password is correct
      const storedUsers = JSON.parse(localStorage.getItem('registered_users') || '{}');
      const userRecord = storedUsers[credentials.username.toLowerCase()];

      if (!userRecord) {
        setError('Username not found. Please check your username or create a new account.');
        setIsLoading(false);
        return;
      }

      // Verify password hash
      const encoder = new TextEncoder();
      const passwordData = encoder.encode(credentials.password + userRecord.salt);
      const hashBuffer = await crypto.subtle.digest('SHA-256', passwordData);
      const passwordHash = Array.from(new Uint8Array(hashBuffer));

      const isPasswordCorrect = JSON.stringify(passwordHash) === JSON.stringify(userRecord.passwordHash);

      if (!isPasswordCorrect) {
        setError('Incorrect password. Please try again.');
        setCredentials(prev => ({ ...prev, password: '' }));
        setIsLoading(false);
        return;
      }

      // Successful login
      if (onLogin) {
        onLogin({
          username: credentials.username,
          password: credentials.password // Pass for encryption key
        });
      }

    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Medical Intake System
          </h1>
          <p className="text-gray-600">
            Secure patient data management
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
            Log back in
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={credentials.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your username"
                autoFocus
                autoComplete="username"
                required
              />
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={credentials.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Logging in...
                </div>
              ) : (
                'Log In'
              )}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              New User?{' '}
              <button
                onClick={onSwitchToSignup}
                className="text-blue-600 hover:text-blue-800 font-medium focus:outline-none focus:underline"
              >
                Create an account
              </button>
            </p>
          </div>

          {/* Security Notice */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              🔒 Your data is encrypted and stored securely on this device
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}