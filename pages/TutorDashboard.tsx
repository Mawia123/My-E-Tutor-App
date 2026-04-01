import React, { useEffect, useState } from 'react';
import { RescheduleOption, SessionStatus, TutoringSession, User } from '../types';
import { api } from '../services/api';

interface TutorDashboardProps {
  user: User;
}

type SessionActionMode = 'actions' | 'cancel' | 'reschedule';

const formatSessionLabel = (date: string, time: string) =>
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

const buildSuggestedOptions = (session: TutoringSession): RescheduleOption[] => {
  const base = new Date(`${session.date}T${session.time}`);

  if (Number.isNaN(base.getTime())) {
    return [
      { date: session.date, time: '10:00' },
      { date: session.date, time: '13:00' },
      { date: session.date, time: '16:00' },
    ];
  }

  return [1, 2, 3].map(offset => {
    const suggestion = new Date(base);
    suggestion.setDate(suggestion.getDate() + offset);

    return {
      date: suggestion.toISOString().slice(0, 10),
      time: suggestion.toTimeString().slice(0, 5),
    };
  });
};

export const TutorDashboard: React.FC<TutorDashboardProps> = ({ user }) => {
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedSession, setSelectedSession] = useState<TutoringSession | null>(null);
  const [actionMode, setActionMode] = useState<SessionActionMode>('actions');
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleOptions, setRescheduleOptions] = useState<RescheduleOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [allSessions, allUsers] = await Promise.all([api.getSessions(), api.getUsers()]);
      setSessions(allSessions.filter(session => session.tutorId === user.id));
      setUsers(allUsers);
    } catch (error) {
      console.error('Failed to load tutor dashboard data:', error);
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

  const handleStatusUpdate = async (sessionId: string, newStatus: SessionStatus) => {
    try {
      await api.updateSession(sessionId, { status: newStatus });
      await loadData();
    } catch (error) {
      console.error('Failed to update session:', error);
      alert('Failed to update the session.');
    }
  };

  const closeModal = () => {
    setSelectedSession(null);
    setActionMode('actions');
    setCancelReason('');
    setRescheduleOptions([]);
    setIsSubmitting(false);
  };

  const openSessionActions = (session: TutoringSession) => {
    setSelectedSession(session);
    setActionMode('actions');
    setCancelReason('');
    setRescheduleOptions(session.rescheduleOptions?.length ? session.rescheduleOptions : buildSuggestedOptions(session));
  };

  const handleRescheduleOptionChange = (index: number, field: keyof RescheduleOption, value: string) => {
    setRescheduleOptions(current =>
      current.map((option, optionIndex) => (optionIndex === index ? { ...option, [field]: value } : option))
    );
  };

  const notifyStudent = async (session: TutoringSession, text: string) => {
    await api.createMessage({
      id: Math.random().toString(36).slice(2, 11),
      senderId: user.id,
      receiverId: session.studentId,
      text,
      timestamp: Date.now(),
      read: false,
    });
  };

  const handleCancelSession = async () => {
    if (!selectedSession) return;

    setIsSubmitting(true);

    try {
      await api.updateSession(selectedSession.id, {
        status: SessionStatus.CANCELLED,
        cancellationReason: cancelReason.trim(),
        rescheduleOptions: [],
      });

      const reasonSuffix = cancelReason.trim() ? ` Reason: ${cancelReason.trim()}` : '';
      await notifyStudent(
        selectedSession,
        `Your ${selectedSession.subject} session on ${selectedSession.date} at ${formatTimeOnly(selectedSession.date, selectedSession.time)} was cancelled by ${user.fullName}.${reasonSuffix}`
      );

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to cancel session:', error);
      alert('Failed to cancel the session.');
      setIsSubmitting(false);
    }
  };

  const handleSubmitReschedule = async () => {
    if (!selectedSession) return;

    const validOptions = rescheduleOptions.filter(option => option.date && option.time).slice(0, 3);

    if (validOptions.length < 2) {
      alert('Please provide at least 2 new time options.');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.updateSession(selectedSession.id, {
        rescheduleOptions: validOptions,
        cancellationReason: '',
      });

      await notifyStudent(
        selectedSession,
        `${user.fullName} suggested new times for your ${selectedSession.subject} session: ${validOptions
          .map(option => `${formatSessionLabel(option.date, option.time)} for ${selectedSession.duration} minutes`)
          .join(', ')}. Open the session to choose one.`
      );

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to propose new times:', error);
      alert('Failed to send the reschedule options.');
      setIsSubmitting(false);
    }
  };

  if (!user.isApproved) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-5xl mb-6">Pending</div>
        <h2 className="text-2xl font-bold text-gray-900">Application Pending</h2>
        <p className="text-gray-500 mt-2 max-w-xs mx-auto">
          Your tutor application is being reviewed by the administrator. You&apos;ll receive full access once approved.
        </p>
      </div>
    );
  }

  const pendingRequests = sessions.filter(session => session.status === SessionStatus.PENDING);
  const upcomingSessions = sessions.filter(session => session.status === SessionStatus.ACCEPTED);
  const currentTutor = users.find(entry => entry.id === user.id) || user;
  const selectedStudent = users.find(entry => entry.id === selectedSession?.studentId);

  return (
    <div className="p-4 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Tutor Dashboard</h2>
          <p className="text-xs text-gray-500">Managing your schedule</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-600">★ {currentTutor.rating || 0}</div>
          <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Overall Rating</div>
        </div>
      </header>

      {pendingRequests.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-amber-600 uppercase tracking-widest mb-3">
            New Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.map(session => {
              const student = users.find(entry => entry.id === session.studentId);

              return (
                <div key={session.id} className="bg-amber-50 border border-amber-100 p-4 rounded-2xl shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-gray-900">{student?.fullName || 'Student'}</h4>
                      <p className="text-xs font-medium text-amber-700 uppercase">{session.subject}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-bold">{session.date}</p>
                      <p className="text-gray-500">{formatTimeOnly(session.date, session.time)}</p>
                      <p className="text-gray-500">Duration: {session.duration} minutes</p>
                    </div>
                  </div>

                  {session.notes?.trim() && (
                    <div className="mt-3 rounded-xl bg-white/80 border border-amber-100 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
                        Student Message
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">{session.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleStatusUpdate(session.id, SessionStatus.ACCEPTED)}
                      className="flex-1 bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(session.id, SessionStatus.REJECTED)}
                      className="flex-1 bg-white border border-red-200 text-red-600 text-xs font-bold py-2 rounded-lg"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Upcoming Sessions</h3>
        {upcomingSessions.length > 0 ? (
          <div className="space-y-3">
            {upcomingSessions.map(session => {
              const student = users.find(entry => entry.id === session.studentId);
              const awaitingChoice = (session.rescheduleOptions || []).length > 0;

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => openSessionActions(session)}
                  className="w-full bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex justify-between items-center text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                      {student?.avatar ? (
                        <img src={student.avatar} alt={student.fullName || 'Student'} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{student?.fullName || 'Student'}</h4>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase">{session.subject}</p>
                      {awaitingChoice && (
                        <p className="text-[10px] text-amber-600 font-bold uppercase mt-1">Awaiting student choice</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold">{session.date}</p>
                    <p className="text-[10px] text-gray-500">{formatTimeOnly(session.date, session.time)}</p>
                    <p className="text-[10px] text-gray-500">Duration: {session.duration} minutes</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-100 p-8 rounded-2xl text-center text-gray-400 text-sm">
            No upcoming sessions.
          </div>
        )}
      </section>

      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {actionMode === 'actions' ? 'Manage Session' : actionMode === 'cancel' ? 'Cancel Session' : 'Suggest New Time'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedStudent?.fullName || 'Student'} • {selectedSession.subject}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 text-xl leading-none">
                &times;
              </button>
            </div>

            {actionMode === 'actions' && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Current Session</p>
                  <p className="text-sm font-bold text-gray-900">{selectedSession.date}</p>
                  <p className="text-sm text-gray-600">{formatTimeOnly(selectedSession.date, selectedSession.time)}</p>
                  <p className="text-sm text-gray-600">Duration: {selectedSession.duration} minutes</p>
                </div>

                <button
                  onClick={() => setActionMode('reschedule')}
                  className="w-full rounded-2xl bg-emerald-600 text-white p-4 text-left"
                >
                  <span className="block text-sm font-bold">Reschedule</span>
                  <span className="block text-xs text-emerald-100 mt-1">Recommended: send 2 to 3 options for the student to pick.</span>
                </button>

                <button
                  onClick={() => setActionMode('cancel')}
                  className="w-full rounded-2xl border border-red-200 text-red-600 p-4 text-left"
                >
                  <span className="block text-sm font-bold">Cancel Session</span>
                  <span className="block text-xs text-red-400 mt-1">Student will be notified immediately.</span>
                </button>
              </div>
            )}

            {actionMode === 'cancel' && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-700">This will cancel the session and notify the student right away.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Reason (Optional)</label>
                  <textarea
                    value={cancelReason}
                    onChange={event => setCancelReason(event.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-2xl text-sm h-28"
                    placeholder="Add context for the student if needed."
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setActionMode('actions')}
                    className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-2xl"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCancelSession}
                    disabled={isSubmitting}
                    className="flex-1 bg-red-600 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
                  >
                    Confirm Cancel
                  </button>
                </div>
              </div>
            )}

            {actionMode === 'reschedule' && (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-emerald-800">Send 2 to 3 time options. The student picks one, then confirms it.</p>
                  <p className="text-xs text-emerald-700 mt-2">Duration: {selectedSession.duration} minutes</p>
                </div>

                <div className="space-y-3">
                  {rescheduleOptions.slice(0, 3).map((option, index) => (
                    <div key={`${selectedSession.id}-${index}`} className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Option {index + 1} Date</label>
                        <input
                          type="date"
                          value={option.date}
                          onChange={event => handleRescheduleOptionChange(index, 'date', event.target.value)}
                          className="w-full p-3 border border-gray-200 rounded-2xl text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Option {index + 1} Time</label>
                        <input
                          type="time"
                          value={option.time}
                          onChange={event => handleRescheduleOptionChange(index, 'time', event.target.value)}
                          className="w-full p-3 border border-gray-200 rounded-2xl text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setActionMode('actions')}
                    className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-2xl"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmitReschedule}
                    disabled={isSubmitting}
                    className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
                  >
                    Send Options
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
