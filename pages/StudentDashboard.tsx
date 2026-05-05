import React, { useEffect, useState } from 'react';
import { SessionStatus, TutoringSession, User } from '../types';
import { api } from '../services/api';
import { isPastSession } from '../services/schedule';

interface DashboardProps {
  user: User;
  setTab: (tab: string) => void;
  onViewTutorProfile: (tutor: User) => void;
  onOpenChat: (chatUser: User) => void;
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

const getDeclineReasonLabel = (reason?: string) => {
  const value = (reason || '').trim();
  if (!value) return 'No reason was provided.';
  return value;
};

export const StudentDashboard: React.FC<DashboardProps> = ({ user, setTab, onViewTutorProfile, onOpenChat }) => {
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [tutors, setTutors] = useState<User[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TutoringSession | null>(null);
  const [pendingRating, setPendingRating] = useState<number>(0);
  const [pendingFeedback, setPendingFeedback] = useState('');
  const [reviewIsAnonymous, setReviewIsAnonymous] = useState(false);
  const [isPickingTime, setIsPickingTime] = useState(false);
  const [selectedSuggestedTime, setSelectedSuggestedTime] = useState<{ date: string; time: string } | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'sessions' | 'history'>('sessions');
  const [filterBy, setFilterBy] = useState<'all' | 'status' | 'subject' | 'date'>('all');
  const [filterValue, setFilterValue] = useState('');

  const loadData = async () => {
    try {
      const [allSessions, allTutors] = await Promise.all([api.getSessions(), api.getTutors()]);
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
    setPendingFeedback(selectedSession?.feedback || '');
    setReviewIsAnonymous(selectedSession?.reviewIsAnonymous === true);
    setSelectedSuggestedTime(null);
  }, [selectedSession]);

  const selectedTutor = tutors.find(entry => entry.id === selectedSession?.tutorId);
  const tutorReviewCounts = sessions.reduce<Record<string, number>>((counts, session) => {
    if ((session.rating || 0) > 0) {
      counts[session.tutorId] = (counts[session.tutorId] || 0) + 1;
    }

    return counts;
  }, {});
  const topTutors = [...tutors]
    .sort((left, right) => {
      const reviewCountDifference = (tutorReviewCounts[right.id] || 0) - (tutorReviewCounts[left.id] || 0);

      if (reviewCountDifference !== 0) {
        return reviewCountDifference;
      }

      return (right.rating || 0) - (left.rating || 0);
    })
    .slice(0, 5);

  const formatSessionTopic = (session: TutoringSession) =>
    session.unit ? `${session.subject} - ${session.unit}` : session.subject;

  const getSessionDisplayStatus = (session: TutoringSession) => {
    if (isPastSession(session)) return 'COMPLETED';
    if ((session.rescheduleOptions || []).length > 0 && session.status !== SessionStatus.CANCELLED) {
      return 'AWAITING YOUR CHOICE';
    }
    return session.status;
  };

  const normalizedFilterValue = filterValue.trim().toLowerCase();
  const filteredSessions = sessions.filter(session => {
    if (filterBy === 'all' || !normalizedFilterValue) {
      return true;
    }

    if (filterBy === 'status') {
      return getSessionDisplayStatus(session).toLowerCase().includes(normalizedFilterValue);
    }

    if (filterBy === 'subject') {
      return formatSessionTopic(session).toLowerCase().includes(normalizedFilterValue);
    }

    if (filterBy === 'date') {
      return session.date === filterValue;
    }

    return true;
  });

  const upcomingSessions = sessions.filter(
    session =>
      !isPastSession(session) &&
      session.status !== SessionStatus.CANCELLED &&
      session.status !== SessionStatus.REJECTED
  );
  const activeSessions = showAllSessions ? upcomingSessions : upcomingSessions.slice(0, 4);
  const historySessions = filteredSessions.filter(
    session => isPastSession(session) || session.status === SessionStatus.CANCELLED || session.status === SessionStatus.REJECTED
  );

  const completedCount = sessions.filter(session => isPastSession(session)).length;
  const cancelledCount = sessions.filter(session => session.status === SessionStatus.CANCELLED).length;
  const availableStatuses = Array.from(
    new Set(
      sessions
        .filter(session => isPastSession(session) || session.status === SessionStatus.CANCELLED || session.status === SessionStatus.REJECTED)
        .map(session => getSessionDisplayStatus(session))
    )
  ).sort((left, right) => left.localeCompare(right));
  const availableSubjects = Array.from(new Set(sessions.map(session => formatSessionTopic(session)))).sort((left, right) =>
    left.localeCompare(right)
  );

  useEffect(() => {
    if (filterBy === 'status' && filterValue && !availableStatuses.includes(filterValue)) {
      setFilterValue('');
    }
  }, [availableStatuses, filterBy, filterValue]);

  const handleRateTutor = async () => {
    if (!selectedSession || pendingRating < 1) return;

    try {
      const updated = await api.updateSession(selectedSession.id, {
        rating: pendingRating,
        feedback: pendingFeedback.trim(),
        reviewIsAnonymous,
      });
      setSelectedSession(updated);
      await loadData();
      alert('Tutor review saved successfully.');
    } catch (error) {
      console.error('Failed to rate tutor:', error);
      alert('Failed to save your review.');
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

  const handleDeleteSession = async (sessionId: string) => {
    const shouldDelete = window.confirm(
      'Are you sure you want to delete this session? This action cannot be recovered after deletion.'
    );

    if (!shouldDelete) return;

    try {
      await api.deleteSession(sessionId);
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
      await loadData();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete the session.');
    }
  };

  const handleRequestAnotherTutor = () => {
    setSelectedSession(null);
    setTab('search');
  };

  const handleRequestAnotherTime = () => {
    if (selectedTutor) {
      setSelectedSession(null);
      onViewTutorProfile(selectedTutor);
      return;
    }

    setSelectedSession(null);
    setTab('search');
  };

  const handleExportReport = () => {
    const rows = historySessions.map(session => {
      const tutor = tutors.find(entry => entry.id === session.tutorId);

      return {
        subject: session.subject,
        unit: session.unit || '',
        tutor: tutor?.fullName || 'Tutor',
        date: session.date,
        time: session.time,
        duration: session.duration,
        status: getSessionDisplayStatus(session),
        notes: (session.notes || '').replace(/\r?\n/g, ' '),
      };
    });

    const header = ['Subject', 'Unit', 'Tutor', 'Date', 'Time', 'Duration (Minutes)', 'Status', 'Notes'];
    const csvLines = [
      header.join(','),
      ...rows.map(row =>
        [
          row.subject,
          row.unit,
          row.tutor,
          row.date,
          row.time,
          String(row.duration),
          row.status,
          row.notes,
        ]
          .map(value => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${user.fullName.replace(/\s+/g, '_').toLowerCase()}_session_history.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-5">
      <section className="rounded-[28px] bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="mt-2 text-2xl font-bold">Hello, {user.fullName}!</h2>
            <p className="mt-2 max-w-xs text-sm text-emerald-50">
              Keep track of your tutoring sessions and easily manage your work
            </p>
          </div>
          <button
            onClick={() => setTab('search')}
            className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            Find a Tutor
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'sessions', label: 'Sessions' },
            { id: 'overview', label: 'Overview' },
            { id: 'history', label: 'History' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDashboardTab(tab.id as 'overview' | 'sessions' | 'history')}
              className={`rounded-2xl px-3 py-3 text-sm font-bold transition ${
                dashboardTab === tab.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {dashboardTab === 'overview' && (
        <section className="space-y-4">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Overview</h3>
                <p className="mt-1 text-xs text-gray-500">A compact summary of your session activity.</p>
              </div>
              <button type="button" onClick={() => setDashboardTab('history')} className="text-xs font-bold text-emerald-600">
                Open History
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total</p>
                <p className="mt-2 text-xl font-bold text-emerald-900">{sessions.length}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Completed</p>
                <p className="mt-2 text-xl font-bold text-gray-900">{completedCount}</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Cancelled</p>
                <p className="mt-2 text-xl font-bold text-red-700">{cancelledCount}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Upcoming</p>
                <p className="mt-2 text-xl font-bold text-blue-700">{upcomingSessions.length}</p>
              </div>
            </div>
          </div>

          {false && (
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Top Tutors</h3>
                <p className="mt-1 text-xs text-gray-500">Recommended tutors based on ratings and reviewed sessions.</p>
              </div>
              <button type="button" onClick={() => setTab('search')} className="text-xs font-bold text-emerald-600">
                View More
              </button>
            </div>

            {topTutors.length > 0 ? (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {topTutors.map(tutor => (
                  <button
                    key={tutor.id}
                    type="button"
                    onClick={() => onViewTutorProfile(tutor)}
                    className="min-w-[160px] rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white">
                        {tutor.avatar ? <img src={tutor.avatar} alt={tutor.fullName} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{tutor.fullName}</p>
                        <p className="mt-1 text-xs font-bold text-amber-600">★ {tutor.rating || 0}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                No tutor recommendations yet.
              </div>
            )}
          </div>
          )}
        </section>
      )}

      {dashboardTab === 'sessions' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Upcoming Sessions</h3>
              <p className="mt-1 text-xs text-gray-500">Your current and active tutoring bookings.</p>
            </div>
            {upcomingSessions.length > 4 && (
              <button onClick={() => setShowAllSessions(current => !current)} className="text-sm font-semibold text-emerald-600">
                {showAllSessions ? 'Show Less' : 'View All'}
              </button>
            )}
          </div>

          {activeSessions.length > 0 ? (
            <div className="space-y-3">
              {activeSessions.map(session => {
                const tutor = tutors.find(entry => entry.id === session.tutorId);
                const hasRescheduleOptions = (session.rescheduleOptions || []).length > 0;

                return (
                  <div key={session.id} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl bg-gray-100">
                        {tutor?.avatar ? <img src={tutor.avatar} alt={tutor.fullName} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-bold text-gray-900">{formatSessionTopic(session)}</h4>
                            {tutor && <p className="mt-1 text-xs font-semibold text-emerald-700">{tutor.fullName}</p>}
                            <p className="mt-1 text-xs text-gray-500">{session.date} - {formatTimeOnly(session.date, session.time)}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
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
                            {hasRescheduleOptions ? 'New Time Options' : getSessionDisplayStatus(session)}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          {tutor && (
                            <button onClick={() => onOpenChat(tutor)} className="text-sm font-bold text-emerald-600">
                              Message
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSession(session)}
                            className="text-sm font-bold text-gray-500 hover:text-emerald-600"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm text-gray-400">No upcoming sessions.</p>
            </div>
          )}

          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Top Tutors</h3>
                <p className="mt-1 text-xs text-gray-500">Recommended tutors based on ratings and reviewed sessions.</p>
              </div>
              <button type="button" onClick={() => setTab('search')} className="text-xs font-bold text-emerald-600">
                View More
              </button>
            </div>

            {topTutors.length > 0 ? (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {topTutors.map(tutor => (
                  <button
                    key={tutor.id}
                    type="button"
                    onClick={() => onViewTutorProfile(tutor)}
                    className="min-w-[160px] rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white">
                        {tutor.avatar ? <img src={tutor.avatar} alt={tutor.fullName} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{tutor.fullName}</p>
                        <p className="mt-1 text-xs font-bold text-amber-600">★ {tutor.rating || 0}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                No tutor recommendations yet.
              </div>
            )}
          </div>
        </section>
      )}

      {dashboardTab === 'history' && (
        <section className="space-y-4">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Session History</h3>
                <p className="mt-1 text-xs text-gray-500">Filter completed sessions and export them when needed.</p>
              </div>
              <button
                type="button"
                onClick={handleExportReport}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm"
              >
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <select
                value={filterBy}
                onChange={event => {
                  const nextFilter = event.target.value as 'all' | 'status' | 'subject' | 'date';
                  setFilterBy(nextFilter);
                  setFilterValue('');
                }}
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm"
              >
                <option value="all">All Records</option>
                <option value="status">Status</option>
                <option value="subject">Subject</option>
                <option value="date">Date</option>
              </select>

              {filterBy === 'status' ? (
                <select
                  value={filterValue}
                  onChange={event => setFilterValue(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm"
                >
                  <option value="">All statuses</option>
                  {availableStatuses.map(status => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              ) : filterBy === 'subject' ? (
                <select
                  value={filterValue}
                  onChange={event => setFilterValue(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm"
                >
                  <option value="">All subjects</option>
                  {availableSubjects.map(subject => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              ) : filterBy === 'date' ? (
                <input
                  type="date"
                  value={filterValue}
                  onChange={event => setFilterValue(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm"
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500">
                  Showing all session records.
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              You have {historySessions.length} history record{historySessions.length === 1 ? '' : 's'}.
            </p>
          </div>

          {historySessions.length > 0 ? (
            <div className="space-y-3">
              {historySessions.map(session => {
                const tutor = tutors.find(entry => entry.id === session.tutorId);

                return (
                  <div key={`past-${session.id}`} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl bg-gray-100">
                        {tutor?.avatar ? <img src={tutor.avatar} alt={tutor.fullName} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-bold text-gray-900">{formatSessionTopic(session)}</h4>
                            {tutor && <p className="mt-1 text-xs font-semibold text-emerald-700">{tutor.fullName}</p>}
                            <p className="mt-1 text-xs text-gray-500">{session.date} - {formatTimeOnly(session.date, session.time)}</p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                              session.status === SessionStatus.REJECTED
                                ? 'bg-red-100 text-red-700'
                                : session.status === SessionStatus.CANCELLED
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {getSessionDisplayStatus(session)}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          {tutor && (
                            <button onClick={() => onOpenChat(tutor)} className="text-sm font-bold text-emerald-600">
                              Message
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSession(session)}
                            className="text-sm font-bold text-gray-500 hover:text-emerald-600"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => setSelectedSession(session)}
                            className="text-sm font-bold text-amber-600"
                          >
                            {session.rating ? 'Update Review' : 'Rate Tutor'}
                          </button>
                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            className="text-sm font-bold text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm text-gray-400">
                {filteredSessions.length === 0 ? 'No sessions match the current filter.' : 'No session history yet.'}
              </p>
            </div>
          )}
        </section>
      )}

      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm max-h-[calc(100vh-2rem)] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Session Details</h3>
                <p className="text-xs text-gray-500 mt-1">Review your booked session information.</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="text-gray-400 text-xl leading-none">
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                  {selectedSession.unit && <p className="text-xs text-emerald-700 mt-1">{selectedSession.unit}</p>}
                </div>
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Status</p>
                  <p className="text-sm font-bold text-gray-900">
                    {isPastSession(selectedSession)
                      ? 'Completed'
                      : (selectedSession.rescheduleOptions || []).length > 0
                        ? 'Awaiting Your Choice'
                        : selectedSession.status}
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

              {selectedSession.status === SessionStatus.REJECTED && (
                <div className="bg-red-50 rounded-2xl p-3 border border-red-100 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Request Update</p>
                    <p className="text-sm text-red-700 leading-relaxed">
                      Your session request was declined.
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Reason</p>
                    <p className="text-sm text-red-700 leading-relaxed">
                      {getDeclineReasonLabel(selectedSession.cancellationReason)}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={handleRequestAnotherTime}
                      className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white"
                    >
                      Request Another Time
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestAnotherTutor}
                      className="w-full rounded-xl border border-emerald-200 py-2.5 text-sm font-bold text-emerald-700"
                    >
                      Request Another Tutor
                    </button>
                    {selectedTutor && (
                      <button
                        type="button"
                        onClick={() => onOpenChat(selectedTutor)}
                        className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-700"
                      >
                        Message Tutor
                      </button>
                    )}
                  </div>
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
                        }`}>
                          {formatTimeOnly(option.date, option.time)}
                        </span>
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
                          Duration: {selectedSession.duration} minutes
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

              {isPastSession(selectedSession) && (
                <div className="bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">Rate Tutor</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedSession.rating ? 'Update your rating and comment for this tutor.' : 'Share your rating and a short comment for this tutor.'}
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

                  <div className="mt-3">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Comment</label>
                    <textarea
                      value={pendingFeedback}
                      onChange={e => setPendingFeedback(e.target.value)}
                      placeholder="What went well, and what could be even better next time?"
                      className="w-full min-h-24 rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-700 outline-none focus:border-emerald-500"
                      maxLength={300}
                    />
                    <p className="text-[10px] text-gray-400 mt-1 text-right">{pendingFeedback.trim().length}/300</p>
                  </div>

                  <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Review Visibility</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewIsAnonymous(false)}
                        className={`rounded-2xl border px-3 py-3 text-left ${
                          !reviewIsAnonymous
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        <span className="block text-sm font-bold">Show my name</span>
                        <span className="block text-xs mt-1">Your name appears above the subject.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewIsAnonymous(true)}
                        className={`rounded-2xl border px-3 py-3 text-left ${
                          reviewIsAnonymous
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        <span className="block text-sm font-bold">Stay anonymous</span>
                        <span className="block text-xs mt-1">Your review shows as Anonymous Student.</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                      {reviewIsAnonymous ? 'This review will be shown anonymously.' : 'Your name will be shown with this review.'}
                    </p>
                  </div>

                  {selectedSession.feedback?.trim() && selectedSession.feedback !== pendingFeedback.trim() && (
                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-emerald-700 mb-1">Saved Comment</p>
                      <p className="text-sm text-emerald-900 leading-relaxed">{selectedSession.feedback}</p>
                    </div>
                  )}

                  <button
                    onClick={handleRateTutor}
                    disabled={pendingRating < 1}
                    className="w-full mt-3 bg-emerald-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {selectedSession.rating || selectedSession.feedback?.trim() ? 'Update Review' : 'Submit Review'}
                  </button>
                </div>
              )}

              {isPastSession(selectedSession) && (
                <button
                  onClick={() => handleDeleteSession(selectedSession.id)}
                  className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl"
                >
                  Delete Session
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
