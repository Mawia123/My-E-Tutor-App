import React, { useEffect, useState } from 'react';
import { SessionStatus, TutoringSession, User } from '../types';
import { api } from '../services/api';

interface DashboardProps {
  user: User;
  setTab: (tab: string) => void;
  onViewTutorProfile: (tutor: User) => void;
}

const formatSessionOption = (date: string, time: string) =>
  new Date(`${date}T${time}`).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatTimeOnly = (date: string, time: string) =>
  new Date(`${date}T${time}`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

export const StudentDashboard: React.FC<DashboardProps> = ({ user, setTab, onViewTutorProfile }) => {
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [tutors, setTutors] = useState<User[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TutoringSession | null>(null);
  const [pendingRating, setPendingRating] = useState<number>(0);
  const [isPickingTime, setIsPickingTime] = useState(false);
  const [selectedSuggestedTime, setSelectedSuggestedTime] = useState<{ date: string; time: string } | null>(null);

  const loadData = async () => {
    try {
      const [allSessions, allTutors] = await Promise.all([
        api.getSessions(),
        api.getTutors(),
      ]);

      setSessions(allSessions.filter(session => session.studentId === user.id));
      setTutors(allTutors);
    } catch (error) {
      console.error('Failed to load student dashboard data:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [user.id]);

  useEffect(() => {
    setPendingRating(selectedSession?.rating || 0);
    setSelectedSuggestedTime(null);
  }, [selectedSession]);

  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 3);
  const selectedTutor = tutors.find(entry => entry.id === selectedSession?.tutorId);
  const topTutors = [...tutors].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  const handleRateTutor = async () => {
    if (!selectedSession || pendingRating < 1) return;

    try {
      const updated = await api.updateSession(selectedSession.id, { rating: pendingRating });
      setSelectedSession(updated);
      await loadData();
      alert('Tutor rated successfully.');
    } catch (error) {
      console.error('Failed to rate tutor:', error);
      alert('Failed to save your rating.');
    }
  };

  const handlePickSuggestedTime = async () => {
    if (!selectedSession || !selectedTutor || !selectedSuggestedTime) return;

    const { date, time } = selectedSuggestedTime;

    setIsPickingTime(true);

    try {
      const updated = await api.updateSession(selectedSession.id, {
        date,
        time,
        status: SessionStatus.ACCEPTED,
        rescheduleOptions: [],
      });

      await api.createMessage({
        id: Math.random().toString(36).slice(2, 11),
        senderId: user.id,
        receiverId: selectedTutor.id,
        text: `${user.fullName} confirmed the new ${updated.subject} session time: ${formatSessionOption(date, time)}.`,
        timestamp: Date.now(),
        read: false,
      });

      setSelectedSession(updated);
      await loadData();
      alert('New session time confirmed.');
    } catch (error) {
      console.error('Failed to confirm new time:', error);
      alert('Failed to confirm the new time.');
    } finally {
      setIsPickingTime(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <section>
        <div className="bg-emerald-50 p-6 rounded-3xl mb-4">
          <h2 className="text-2xl font-bold text-emerald-900">Hello, {user.fullName}!</h2>
          <p className="text-emerald-700 mt-1">Ready to ace your subjects today?</p>
          <button
            onClick={() => setTab('search')}
            className="mt-4 bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md"
          >
            Find a Tutor
          </button>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Your Sessions</h3>
          {sessions.length > 3 && (
            <button
              onClick={() => setShowAllSessions(current => !current)}
              className="text-emerald-600 text-sm font-semibold"
            >
              {showAllSessions ? 'Show Less' : 'View All'}
            </button>
          )}
        </div>

        {sessions.length > 0 ? (
          <div className="space-y-3">
            {visibleSessions.map(session => {
              const tutor = tutors.find(entry => entry.id === session.tutorId);
              const hasRescheduleOptions = (session.rescheduleOptions || []).length > 0;

              return (
                <div key={session.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-xl overflow-hidden">
                    {tutor?.avatar ? <img src={tutor.avatar} alt={tutor?.fullName} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900">{session.subject}</h4>
                    <p className="text-xs text-gray-500">{session.date} - {formatTimeOnly(session.date, session.time)}</p>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${
                        hasRescheduleOptions
                          ? 'bg-blue-100 text-blue-700'
                          : session.status === SessionStatus.ACCEPTED
                            ? 'bg-green-100 text-green-700'
                            : session.status === SessionStatus.PENDING
                              ? 'bg-amber-100 text-amber-700'
                              : session.status === SessionStatus.CANCELLED
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {hasRescheduleOptions ? 'NEW TIME OPTIONS' : session.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedSession(session)}
                    className="p-2 text-gray-400 hover:text-emerald-600"
                  >
                    View
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-300 text-center">
            <p className="text-gray-400 text-sm">No tutoring sessions scheduled yet.</p>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Top Tutors</h3>
        <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar">
          {topTutors.map(tutor => (
            <div key={tutor.id} className="min-w-[140px] bg-white p-4 rounded-3xl border border-gray-100 shadow-sm text-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-3 border-2 border-emerald-100 p-0.5 overflow-hidden">
                {tutor.avatar ? (
                  <img src={tutor.avatar} alt={tutor.fullName} className="rounded-full w-full h-full object-cover" />
                ) : null}
              </div>
              <h4 className="font-bold text-sm text-gray-900 line-clamp-1">{tutor.fullName.split(' ')[0]}</h4>
              <div className="flex items-center justify-center gap-1 mt-1 text-amber-500">
                <span className="text-xs font-bold">★ {tutor.rating || 0}</span>
              </div>
              <button onClick={() => onViewTutorProfile(tutor)} className="mt-3 text-xs font-bold text-emerald-600">
                Profile
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Session Details</h3>
                <p className="text-xs text-gray-500 mt-1">Review your booked session information.</p>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="text-gray-400 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl">
                {selectedTutor?.avatar ? (
                  <img src={selectedTutor.avatar} className="w-12 h-12 rounded-full object-cover" />
                ) : null}
                <div>
                  <p className="text-xs text-emerald-700 font-bold uppercase">Tutor</p>
                  <p className="text-sm font-bold text-emerald-900">{selectedTutor?.fullName || 'Tutor'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Subject</p>
                  <p className="text-sm font-bold text-gray-900">{selectedSession.subject}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Status</p>
                  <p className="text-sm font-bold text-gray-900">
                    {(selectedSession.rescheduleOptions || []).length > 0 ? 'Awaiting Your Choice' : selectedSession.status}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Date</p>
                  <p className="text-sm font-bold text-gray-900">{selectedSession.date}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Time</p>
                  <p className="text-sm font-bold text-gray-900">{formatTimeOnly(selectedSession.date, selectedSession.time)}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Duration</p>
                <p className="text-sm font-bold text-gray-900">{selectedSession.duration} minutes</p>
              </div>

              <div className="bg-gray-50 rounded-2xl p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Message to Tutor</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {selectedSession.notes?.trim() || 'No message was added to this session request.'}
                </p>
              </div>

              {selectedSession.status === SessionStatus.CANCELLED && (
                <div className="bg-red-50 rounded-2xl p-3 border border-red-100">
                  <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Cancellation Reason</p>
                  <p className="text-sm text-red-700 leading-relaxed">
                    {selectedSession.cancellationReason?.trim() || 'The tutor cancelled this session without adding a reason.'}
                  </p>
                </div>
              )}

              {(selectedSession.rescheduleOptions || []).length > 0 && selectedSession.status !== SessionStatus.CANCELLED && (
                <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] font-bold text-blue-600 uppercase">Suggest New Time</p>
                      <p className="text-xs text-blue-700 mt-1">Pick one of the tutor&apos;s proposed time slots, then confirm it.</p>
                    </div>
                    <span className="text-[10px] font-bold text-blue-500 uppercase">Select Time</span>
                  </div>

                  <div className="space-y-2">
                    {selectedSession.rescheduleOptions?.map((option, index) => (
                      <button
                        key={`${option.date}-${option.time}`}
                        onClick={() => setSelectedSuggestedTime({ date: option.date, time: option.time })}
                        disabled={isPickingTime}
                        className={`w-full rounded-2xl px-4 py-3 text-left disabled:opacity-50 ${
                          selectedSuggestedTime?.date === option.date && selectedSuggestedTime?.time === option.time
                            ? 'bg-blue-600 border border-blue-600 text-white'
                            : 'bg-white border border-blue-100'
                        }`}
                      >
                        <span className={`block text-[10px] font-bold uppercase ${
                          selectedSuggestedTime?.date === option.date && selectedSuggestedTime?.time === option.time
                            ? 'text-blue-100'
                            : 'text-blue-500'
                        }`}>
                          Option {index + 1}
                        </span>
                        <span className={`block text-sm font-bold ${
                          selectedSuggestedTime?.date === option.date && selectedSuggestedTime?.time === option.time
                            ? 'text-white'
                            : 'text-gray-900'
                        }`}>{formatTimeOnly(option.date, option.time)}</span>
                        <span className={`block text-xs mt-1 ${
                          selectedSuggestedTime?.date === option.date && selectedSuggestedTime?.time === option.time
                            ? 'text-blue-100'
                            : 'text-blue-600'
                        }`}>
                          Date: {formatSessionOption(option.date, option.time).split(', ').slice(0, 3).join(', ')}
                        </span>
                        <span className={`block text-xs mt-1 ${
                          selectedSuggestedTime?.date === option.date && selectedSuggestedTime?.time === option.time
                            ? 'text-blue-100'
                            : 'text-blue-600'
                        }`}>
                          {selectedSuggestedTime?.date === option.date && selectedSuggestedTime?.time === option.time
                            ? `Duration: ${selectedSession.duration} minutes`
                            : `Duration: ${selectedSession.duration} minutes`}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handlePickSuggestedTime}
                    disabled={!selectedSuggestedTime || isPickingTime}
                    className="w-full mt-3 bg-emerald-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
                  >
                    Confirm Selected Time
                  </button>
                </div>
              )}

              {(selectedSession.status === SessionStatus.ACCEPTED || selectedSession.status === SessionStatus.COMPLETED) && (
                <div className="bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">Rate Tutor</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedSession.rating ? 'Update your rating for this tutor.' : 'Share your experience with this tutor.'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-amber-600">
                      {pendingRating > 0 ? `${pendingRating}/5` : 'Not rated'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setPendingRating(star)}
                        className={`w-10 h-10 rounded-full text-sm font-bold border transition-colors ${
                          star <= pendingRating
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-white border-gray-200 text-gray-500'
                        }`}
                      >
                        {star}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleRateTutor}
                    disabled={pendingRating < 1}
                    className="w-full mt-3 bg-emerald-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {selectedSession.rating ? 'Update Rating' : 'Submit Rating'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
