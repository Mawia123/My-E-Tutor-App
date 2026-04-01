import React, { useEffect, useState } from 'react';
import { User, SessionStatus, UserRole } from '../types';
import { SUBJECTS } from '../constants';
import { getGeminiAssistance } from '../services/geminiService';
import { api } from '../services/api';

interface SearchProps {
  user: User;
  onViewTutorProfile: (tutor: User) => void;
}

export const SearchTutors: React.FC<SearchProps> = ({ user, onViewTutorProfile }) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookingTutor, setBookingTutor] = useState<User | null>(null);
  const [bookingData, setBookingData] = useState({ subject: '', date: '', time: '', duration: 60, notes: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [allTutors, setAllTutors] = useState<User[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);

  useEffect(() => {
    const normalizeTutor = (rawUser: any): User => ({
      id: rawUser.id?.toString() || Math.random().toString(36).substr(2, 9),
      fullName: rawUser.fullName || rawUser.name || '',
      email: rawUser.email || '',
      role: rawUser.role as UserRole,
      password: rawUser.password,
      bio: rawUser.bio || '',
      subjects: Array.isArray(rawUser.subjects) ? rawUser.subjects : [],
      rating: rawUser.rating || 0,
      totalSessions: rawUser.totalSessions || 0,
      isApproved: rawUser.isApproved === true || rawUser.approved === 1,
      isActive: rawUser.isActive !== false,
      avatar: rawUser.avatar || '',
    });

    const loadTutors = async () => {
      setLoadingTutors(true);
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${API_URL}/tutors`);
        if (!response.ok) throw new Error('Failed to fetch tutors');

        const users = await response.json();
        const backendTutors = users
          .map(normalizeTutor)
          .filter((u: User) => u.role === UserRole.TUTOR && u.isApproved && u.isActive);

        setAllTutors(backendTutors);
      } catch (error) {
        console.error('Error loading tutors:', error);
        setAllTutors([]);
      } finally {
        setLoadingTutors(false);
      }
    };

    loadTutors();
  }, []);

  const tutors = allTutors.filter(u =>
    (selectedSubject === 'All' || u.subjects?.includes(selectedSubject)) &&
    (u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.subjects?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const openBookingModal = (tutor: User) => {
    setBookingTutor(tutor);
    setBookingData({
      subject: tutor.subjects?.[0] || '',
      date: '',
      time: '',
      duration: 60,
      notes: '',
    });
  };

  const closeBookingModal = () => {
    setBookingTutor(null);
    setBookingData({ subject: '', date: '', time: '', duration: 60, notes: '' });
  };

  const handleBookSession = async () => {
    if (!bookingTutor || !bookingData.subject || !bookingData.date || !bookingData.time) {
      alert('Please choose a subject, date, and time for the session.');
      return;
    }

    const newSession = {
      id: Math.random().toString(36).substr(2, 9),
      studentId: user.id,
      tutorId: bookingTutor.id,
      subject: bookingData.subject,
      date: bookingData.date,
      time: bookingData.time,
      duration: bookingData.duration,
      status: SessionStatus.PENDING,
      notes: bookingData.notes,
      createdAt: Date.now()
    };

    try {
      await api.createSession(newSession);
      alert('Session requested successfully!');
      closeBookingModal();
    } catch (error) {
      console.error('Failed to book session:', error);
      alert('Failed to request session. Please try again.');
    }
  };

  const generateAIPrompt = async () => {
    if (!bookingTutor) return;
    setAiLoading(true);
    const prompt = `Draft a polite and clear message from a student to their tutor ${bookingTutor.fullName} requesting help with ${bookingData.subject || bookingTutor.subjects?.[0] || 'the selected subject'}. The student is struggling with the basics.`;
    const result = await getGeminiAssistance(prompt);
    setBookingData({ ...bookingData, notes: result });
    setAiLoading(false);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by tutor or subject..."
          className="w-full bg-white border border-gray-200 px-10 py-3 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-emerald-500"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <span className="absolute left-4 top-3.5 text-gray-400">🔍</span>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
        {['All', ...SUBJECTS].map(subject => (
          <button
            key={subject}
            onClick={() => setSelectedSubject(subject)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              selectedSubject === subject ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-100 shadow-sm'
            }`}
          >
            {subject}
          </button>
        ))}
      </div>

      <div className="space-y-4 pt-2">
        {loadingTutors && (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 text-center text-sm text-gray-500">
            Loading tutors...
          </div>
        )}

        {tutors.map(tutor => (
          <div key={tutor.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:border-emerald-200">
            <div className="flex gap-4">
              <div className="w-16 h-16 rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden flex items-center justify-center">
                {tutor.avatar ? (
                  <img src={tutor.avatar} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-gray-300 uppercase">No Image</span>
                )}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <button
                    type="button"
                    onClick={() => onViewTutorProfile(tutor)}
                    className="font-bold text-left text-gray-900 transition-colors hover:text-emerald-600"
                  >
                    {tutor.fullName}
                  </button>
                  <div className="flex items-center gap-1 text-amber-500 font-bold text-sm">
                    <span>★ {tutor.rating}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mt-1">{tutor.bio}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tutor.subjects?.map(s => (
                    <span key={s} className="text-[9px] bg-emerald-50 text-emerald-700 font-bold uppercase px-2 py-0.5 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => openBookingModal(tutor)}
              className="w-full mt-4 bg-emerald-600 text-white font-bold py-2 rounded-xl text-sm transition-colors hover:bg-emerald-700"
            >
              Book Session
            </button>
          </div>
        ))}

        {!loadingTutors && tutors.length === 0 && (
          <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-300 text-center">
            <h3 className="text-gray-900 font-bold mb-2">No tutors found</h3>
            <p className="text-gray-500 text-sm">
              Try a different name or subject, or make sure tutors have been approved.
            </p>
          </div>
        )}
      </div>

      {bookingTutor && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Request Session</h3>
              <button onClick={closeBookingModal} className="text-gray-400 text-xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-white border border-emerald-100 overflow-hidden flex items-center justify-center">
                  {bookingTutor.avatar ? (
                    <img src={bookingTutor.avatar} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-gray-300 uppercase">Empty</span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-emerald-700 font-bold">Tutor</p>
                  <p className="text-sm font-bold text-emerald-900">{bookingTutor.fullName}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subject</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                  value={bookingData.subject}
                  onChange={e => setBookingData({ ...bookingData, subject: e.target.value })}
                >
                  <option value="">Select a subject</option>
                  {(bookingTutor.subjects && bookingTutor.subjects.length > 0 ? bookingTutor.subjects : SUBJECTS).map(subject => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                <input
                  type="date"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={bookingData.date}
                  onChange={e => setBookingData({ ...bookingData, date: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Time</label>
                <input
                  type="time"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={bookingData.time}
                  onChange={e => setBookingData({ ...bookingData, time: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Duration</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                  value={bookingData.duration}
                  onChange={e => setBookingData({ ...bookingData, duration: Number(e.target.value) })}
                >
                  {[30, 60, 90].map(duration => (
                    <option key={duration} value={duration}>
                      {duration} minutes
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Message to Tutor</label>
                  <button
                    onClick={generateAIPrompt}
                    disabled={aiLoading}
                    className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full"
                  >
                    {aiLoading ? 'Thinking...' : 'AI Assist'}
                  </button>
                </div>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm h-24 resize-none"
                  placeholder="Tell the tutor what you need help with..."
                  value={bookingData.notes}
                  onChange={e => setBookingData({ ...bookingData, notes: e.target.value })}
                />
              </div>

              <button
                onClick={handleBookSession}
                className="w-full bg-emerald-600 text-white font-bold py-3 rounded-2xl shadow-lg mt-4"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
