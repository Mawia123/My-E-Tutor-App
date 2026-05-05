import React, { useState } from 'react';
import { UserRole } from '../types';
import { api } from '../services/api';

interface RegisterProps {
  onBack: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onBack }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: UserRole.STUDENT,
    subjects: [] as string[]
  });

  const handleRegister = async () => {
    try {
      const result = await api.createUser({
        name: formData.fullName,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });

      console.log("Registration successful:", result);
      alert("Registration successful. Please login.");
      onBack();
    } catch (error) {
      console.error("Registration error:", error);
      alert("Registration failed: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="w-full min-h-dvh bg-white flex flex-col p-6 sm:max-w-md sm:mx-auto sm:min-h-screen sm:shadow-xl">
      <button onClick={onBack} className="text-emerald-600 mb-8 flex items-center gap-1 font-semibold">
        ← Back to Login
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
        <p className="text-gray-500">Join our academic community</p>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Enter your full name"
              value={formData.fullName}
              onChange={e => setFormData({...formData, fullName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">University Email</label>
            <input
              type="email"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="your.name@university.edu"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="At least 8 characters"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!formData.fullName || !formData.email || formData.password.length < 4}
            className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            Next Step
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <p className="font-medium text-gray-700">Choose your primary role:</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setFormData({...formData, role: UserRole.STUDENT})}
              className={`p-6 border-2 rounded-2xl flex flex-col items-center transition-all ${
                formData.role === UserRole.STUDENT ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-200'
              }`}
            >
              <span className="text-3xl mb-2">📖</span>
              <span className="font-bold">Student</span>
              <span className="text-xs text-gray-400 mt-1">I want to learn</span>
            </button>
            <button
              onClick={() => setFormData({...formData, role: UserRole.TUTOR})}
              className={`p-6 border-2 rounded-2xl flex flex-col items-center transition-all ${
                formData.role === UserRole.TUTOR ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-200'
              }`}
            >
              <span className="text-3xl mb-2">🎓</span>
              <span className="font-bold">Tutor</span>
              <span className="text-xs text-gray-400 mt-1">I want to teach</span>
            </button>
          </div>

          <button
            onClick={handleRegister}
            className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl mt-4"
          >
            Complete Registration
          </button>
          <button
            onClick={() => setStep(1)}
            className="w-full text-gray-500 py-2"
          >
            Previous
          </button>
        </div>
      )}
    </div>
  );
};
