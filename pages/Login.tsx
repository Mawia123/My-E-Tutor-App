import React, { useState } from 'react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  onGoToRegister: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onGoToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const response = await fetch(`${API_URL}/users`);
      if (!response.ok) throw new Error("Failed to fetch users");

      const users = await response.json();
      const foundUser = users.find((u: any) => u.email === email && u.password === password);

      if (foundUser) {
        // normalize DB schema to front-end user shape
        const normalizedUser: any = {
          id: foundUser.id.toString(),
          fullName: foundUser.fullName || foundUser.name || '',
          email: foundUser.email,
          password: foundUser.password,
          role: foundUser.role,
          isApproved: foundUser.isApproved === true || foundUser.approved === 1,
          isActive: true,
          subjects: foundUser.subjects || [],
          bio: foundUser.bio || '',
          rating: foundUser.rating || 0,
          totalSessions: foundUser.totalSessions || 0,
          avatar: foundUser.avatar || ''
        };

        console.log("Login successful", normalizedUser);
        onLogin(normalizedUser);
      } else {
        setError('Invalid email or password');
      }
    } catch (error) {
      console.error("Error logging in:", error);
      setError('An error occurred during login. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-6 max-w-md mx-auto shadow-xl">
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            placeholder="••••••••"
            required
          />
        </div>

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
