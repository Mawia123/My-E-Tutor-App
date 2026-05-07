import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface LoginProps {
  onLogin: (user: User) => void;
  onGoToRegister: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onGoToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const authenticatedUser = await api.login(email, password);
      onLogin(authenticatedUser);
    } catch (error) {
      console.error('Error logging in:', error);
      setError(error instanceof Error ? error.message : 'An error occurred during login. Please try again.');
    }
  };

  const handlePasswordReset = async () => {
    setResetError('');
    setResetMessage('');

    if (!resetEmail.trim()) {
      setResetError('Please enter the email address for your account.');
      return;
    }

    if (newPassword.length < 4) {
      setResetError('New password must be at least 4 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('The new passwords do not match.');
      return;
    }

    setIsResettingPassword(true);

    try {
      const result = await api.resetPassword(resetEmail, newPassword);
      setResetMessage(result.message);
      setResetEmail('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Password reset failed:', error);
      setResetError(error instanceof Error ? error.message : 'Unable to reset password right now.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="w-full min-h-dvh bg-white flex flex-col justify-center px-6 sm:max-w-md sm:mx-auto sm:min-h-screen sm:shadow-xl">
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">🎓</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 whitespace-nowrap">Welcome to PeerTutoringPro</h1>
        <p className="text-gray-500 mt-2">Sign in to your peer tutoring account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            placeholder="name@university.edu"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <div className="relative">
            <input
              type={showLoginPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 pr-16 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowLoginPassword((current) => !current)}
              className="absolute inset-y-0 right-4 text-sm font-semibold text-gray-500 hover:text-emerald-600"
            >
              {showLoginPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setShowResetForm((current) => !current);
              setResetMessage('');
              setResetError('');
              setResetEmail(email);
            }}
            className="text-sm font-semibold text-emerald-600 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        {showResetForm && (
          <div className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Reset your password</h2>
            </div>

            {resetError && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                {resetError}
              </div>
            )}

            {resetMessage && (
              <div className="rounded-lg border border-emerald-100 bg-white p-3 text-sm text-emerald-700">
                {resetMessage}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Email</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="name@university.edu"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-16 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                    placeholder="Choose a new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((current) => !current)}
                    className="absolute inset-y-0 right-4 text-sm font-semibold text-gray-500 hover:text-emerald-600"
                  >
                    {showNewPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-16 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                    placeholder="Re-enter the new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute inset-y-0 right-4 text-sm font-semibold text-gray-500 hover:text-emerald-600"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handlePasswordReset()}
                disabled={isResettingPassword}
                className="w-full rounded-xl bg-white px-4 py-3 font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResettingPassword ? 'Resetting Password...' : 'Reset Password'}
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-colors"
        >
          Sign In
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-gray-600">
          Don't have an account?{' '}
          <button onClick={onGoToRegister} className="text-emerald-600 font-bold hover:underline">
            Register Now
          </button>
        </p>
      </div>

      <div className="mt-12 text-center text-xs text-gray-400">
        <p>Academic Use Only • &copy; 2026 PeerTutoringPro</p>
      </div>
    </div>
  );
};
