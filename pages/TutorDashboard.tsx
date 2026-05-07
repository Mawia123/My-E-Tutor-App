import React, { useEffect, useState } from 'react';
import { RescheduleOption, SessionStatus, TutoringSession, User } from '../types';
import { api } from '../services/api';
import { getTutorDailyTimetable, isPastSession, isUpcomingSession } from '../services/schedule';

interface TutorDashboardProps {
  user: User;
  onOpenChat: (chatUser: User) => void;
}

type SessionActionMode = 'actions' | 'cancel' | 'reschedule' | 'decline';
type TutorTab = 'overview' | 'students' | 'sessions' | 'insights';
type ReportRange = 'week' | 'month' | 'all';

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

const getSessionUnitLabel = (session: TutoringSession) => session.unit?.trim() || 'Unit not specified';

const formatSessionTopic = (session: TutoringSession) =>
  session.unit ? `${session.subject} - ${session.unit}` : session.subject;

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

const toSessionDateTime = (session: TutoringSession) => new Date(`${session.date}T${session.time}`);

const isWithinRange = (session: TutoringSession, range: ReportRange) => {
  if (range === 'all') return true;

  const sessionDate = toSessionDateTime(session);
  if (Number.isNaN(sessionDate.getTime())) return false;

  const now = new Date();
  const daysBack = range === 'week' ? 7 : 30;
  const earliest = new Date(now);
  earliest.setDate(now.getDate() - daysBack);

  return sessionDate >= earliest && sessionDate <= now;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const TutorDashboard: React.FC<TutorDashboardProps> = ({ user, onOpenChat }) => {
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedSession, setSelectedSession] = useState<TutoringSession | null>(null);
  const [actionMode, setActionMode] = useState<SessionActionMode>('actions');
  const [cancelReason, setCancelReason] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [rescheduleOptions, setRescheduleOptions] = useState<RescheduleOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TutorTab>('sessions');
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [historyRange, setHistoryRange] = useState<ReportRange>('all');
  const [insightsRange, setInsightsRange] = useState<ReportRange>('all');

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
    setDeclineReason('');
    setRescheduleOptions([]);
    setIsSubmitting(false);
  };

  const openSessionActions = (session: TutoringSession) => {
    setSelectedSession(session);
    setActionMode('actions');
    setCancelReason('');
    setDeclineReason('');
    setRescheduleOptions(session.rescheduleOptions?.length ? session.rescheduleOptions : buildSuggestedOptions(session));
  };

  const handleRescheduleOptionChange = (index: number, field: keyof RescheduleOption, value: string) => {
    setRescheduleOptions(current =>
      current.map((option, optionIndex) => (optionIndex === index ? { ...option, [field]: value } : option))
    );
  };

  const handleDeleteSession = async (sessionId: string) => {
    const shouldDelete = window.confirm(
      'Are you sure you want to delete this session? This action cannot be recovered after deletion.'
    );

    if (!shouldDelete) return;

    try {
      await api.deleteSession(sessionId);
      if (selectedSession?.id === sessionId) {
        closeModal();
      }
      await loadData();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete the session.');
    }
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
        `Your ${formatSessionTopic(selectedSession)} session on ${selectedSession.date} at ${formatTimeOnly(selectedSession.date, selectedSession.time)} was cancelled by ${user.fullName}.${reasonSuffix}`
      );

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to cancel session:', error);
      alert('Failed to cancel the session.');
      setIsSubmitting(false);
    }
  };

  const handleDeclineSession = async () => {
    if (!selectedSession) return;

    setIsSubmitting(true);

    try {
      const resolvedReason = declineReason.trim();

      await api.updateSession(selectedSession.id, {
        status: SessionStatus.REJECTED,
        cancellationReason: resolvedReason,
        rescheduleOptions: [],
      });

      const reasonSentence = resolvedReason ? ` Reason: ${resolvedReason}` : '';
      await notifyStudent(
        selectedSession,
        `Your session request for ${formatSessionTopic(selectedSession)} on ${selectedSession.date} at ${formatTimeOnly(selectedSession.date, selectedSession.time)} was declined.${reasonSentence} You can request another time, choose another tutor, or message ${user.fullName} if you need more clarity.`
      );

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to decline session:', error);
      alert('Failed to decline the session.');
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
        `${user.fullName} suggested new times for your ${formatSessionTopic(selectedSession)} session: ${validOptions
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
          Your tutor application is still under review. You&apos;ll receive full access once approved.
        </p>
      </div>
    );
  }

  const pendingRequests = sessions.filter(session => session.status === SessionStatus.PENDING && isUpcomingSession(session));
  const acceptedUpcomingSessions = sessions.filter(session => session.status === SessionStatus.ACCEPTED && isUpcomingSession(session));
  const displayedUpcomingSessions = showAllUpcoming ? acceptedUpcomingSessions : acceptedUpcomingSessions.slice(0, 4);
  const allPastSessions = sessions.filter(session => isPastSession(session)).sort(
    (left, right) => toSessionDateTime(right).getTime() - toSessionDateTime(left).getTime()
  );
  const filteredHistorySessions = allPastSessions.filter(session => isWithinRange(session, historyRange));
  const currentTutor = users.find(entry => entry.id === user.id) || user;
  const selectedStudent = users.find(entry => entry.id === selectedSession?.studentId);
  const today = new Date().toLocaleDateString('en-CA');
  const todaysTimetable = getTutorDailyTimetable(sessions, user.id, today);
  const uniqueStudents = users
    .filter(entry => sessions.some(session => session.studentId === entry.id))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const ratedSessions = sessions.filter(session => (session.rating || 0) > 0);
  const averageRating = ratedSessions.length > 0
    ? Number((ratedSessions.reduce((sum, session) => sum + Number(session.rating || 0), 0) / ratedSessions.length).toFixed(1))
    : Number(currentTutor.rating || 0);
  const sessionsConductedCount = allPastSessions.filter(session => session.status !== SessionStatus.CANCELLED).length;
  const attendanceEligibleSessions = sessions.filter(
    session => isPastSession(session) || session.status === SessionStatus.CANCELLED
  );
  const attendedSessions = allPastSessions.filter(session => session.status !== SessionStatus.CANCELLED).length;
  const attendanceRate = attendanceEligibleSessions.length > 0
    ? clampPercent((attendedSessions / attendanceEligibleSessions.length) * 100)
    : 0;

  const insightSessions = sessions.filter(session => isWithinRange(session, insightsRange));
  const insightPastSessions = insightSessions.filter(session => isPastSession(session));
  const insightRatedSessions = insightSessions.filter(session => (session.rating || 0) > 0);
  const insightAverageRating = insightRatedSessions.length > 0
    ? Number((insightRatedSessions.reduce((sum, session) => sum + Number(session.rating || 0), 0) / insightRatedSessions.length).toFixed(1))
    : 0;
  const insightAttendanceEligible = insightSessions.filter(
    session => isPastSession(session) || session.status === SessionStatus.CANCELLED
  );
  const insightAttendanceRate = insightAttendanceEligible.length > 0
    ? clampPercent(
        (insightPastSessions.filter(session => session.status !== SessionStatus.CANCELLED).length / insightAttendanceEligible.length) * 100
      )
    : 0;
  const insightSessionsTaught = insightPastSessions.filter(session => session.status !== SessionStatus.CANCELLED).length;

  const exportRows = (rows: Array<Array<string | number>>, filename: string) => {
    const csv = rows
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadHistory = () => {
    const rows: Array<Array<string | number>> = [
      ['Student', 'Subject', 'Unit', 'Date', 'Time', 'Duration (Minutes)', 'Status', 'Rating'],
      ...filteredHistorySessions.map(session => {
        const student = users.find(entry => entry.id === session.studentId);
        return [
          student?.fullName || 'Student',
          session.subject,
          getSessionUnitLabel(session),
          session.date,
          session.time,
          session.duration,
          session.status,
          session.rating || 0,
        ];
      }),
    ];

    exportRows(rows, `${user.fullName.replace(/\s+/g, '_').toLowerCase()}_session_history.csv`);
  };

  const handleDownloadPerformanceReport = () => {
    const rangeLabel = insightsRange === 'week' ? 'This Week' : insightsRange === 'month' ? 'This Month' : 'All Time';
    const rows: Array<Array<string | number>> = [
      ['Tutor Performance Report'],
      ['Tutor', user.fullName],
      ['Range', rangeLabel],
      ['Total Sessions Taught', insightSessionsTaught],
      ['Average Rating', insightAverageRating],
      ['Attendance Rate', `${insightAttendanceRate}%`],
      [''],
      ['Session History Overview'],
      ['Student', 'Subject', 'Unit', 'Date', 'Time', 'Status', 'Rating'],
      ...insightPastSessions.map(session => {
        const student = users.find(entry => entry.id === session.studentId);
        return [
          student?.fullName || 'Student',
          session.subject,
          getSessionUnitLabel(session),
          session.date,
          session.time,
          session.status,
          session.rating || 0,
        ];
      }),
    ];

    exportRows(rows, `${user.fullName.replace(/\s+/g, '_').toLowerCase()}_performance_report.csv`);
  };

  const renderProgress = (label: string, value: string, percent: number, accent: string) => (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <span className="text-sm font-bold text-gray-900">{value}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${clampPercent(percent)}%` }} />
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-5">
      <header className="rounded-[28px] bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Hello, {user.fullName}!</h2>
            <p className="mt-2 max-w-xs text-sm text-emerald-50">
              Easily manage your students and sessions, and see how things are going
            </p>
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-3 text-right backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Average Rating</p>
            <p className="mt-2 text-2xl font-bold">★ {averageRating}</p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-gray-100 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: 'sessions', label: 'Sessions' },
            { id: 'overview', label: 'Overview' },
            { id: 'students', label: 'Students' },
            { id: 'insights', label: 'Insights' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TutorTab)}
              className={`rounded-2xl px-3 py-3 text-sm font-bold transition ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'overview' && (
        <section className="space-y-4">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Overview</h3>
                <p className="mt-1 text-xs text-gray-500">A quick snapshot of your teaching activity.</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Today</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">{todaysTimetable.length}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Pending Requests</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">{pendingRequests.length}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Sessions Taught</p>
                <p className="mt-2 text-2xl font-bold text-blue-900">{sessionsConductedCount}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Attendance</p>
                <p className="mt-2 text-2xl font-bold text-violet-900">{attendanceRate}%</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'students' && (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">My Students</h3>
            <p className="mt-1 text-xs text-gray-500">Students you have taught or are currently supporting.</p>
          </div>

          {uniqueStudents.length > 0 ? (
            <div className="space-y-3">
              {uniqueStudents.map(student => (
                <div key={student.id} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                        {student.avatar ? (
                          <img src={student.avatar} alt={student.fullName} className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{student.fullName}</p>
                        <p className="truncate text-xs text-gray-500 mt-1">{student.email}</p>
                      </div>
                    </div>
                    <button onClick={() => onOpenChat(student)} className="text-xs font-bold text-emerald-600">
                      Message
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
              No students linked to your sessions yet.
            </div>
          )}
        </section>
      )}

      {activeTab === 'sessions' && (
        <section className="space-y-5">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Today&apos;s Schedule</h3>
                <p className="mt-1 text-xs text-gray-500">{today}</p>
              </div>
              <span className="text-xs font-bold text-emerald-600">{todaysTimetable.length} today</span>
            </div>

            {todaysTimetable.length > 0 ? (
              <div className="mt-4 space-y-3">
                {todaysTimetable.map(session => {
                  const student = users.find(entry => entry.id === session.studentId);
                  return (
                    <button
                      key={`today-${session.id}`}
                      type="button"
                      onClick={() => openSessionActions(session)}
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{student?.fullName || 'Student'}</p>
                          <p className="mt-1 text-xs text-gray-500">{formatSessionTopic(session)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{formatTimeOnly(session.date, session.time)}</p>
                          <p className="text-[11px] text-gray-500">{session.duration} minutes</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                No bookings on your timetable today.
              </div>
            )}
          </div>

          {pendingRequests.length > 0 && (
            <div>
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
                          <p className="text-[11px] text-gray-600 mt-1">Unit: {getSessionUnitLabel(session)}</p>
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
                          onClick={() => {
                            setSelectedSession(session);
                            setActionMode('decline');
                            setDeclineReason('');
                          }}
                          className="flex-1 bg-white border border-red-200 text-red-600 text-xs font-bold py-2 rounded-lg"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Upcoming Sessions</h3>
                <p className="mt-1 text-xs text-gray-500">Confirmed sessions that need your attention.</p>
              </div>
              {acceptedUpcomingSessions.length > 4 && (
                <button onClick={() => setShowAllUpcoming(current => !current)} className="text-xs font-bold text-emerald-600">
                  {showAllUpcoming ? 'Show Less' : 'View All'}
                </button>
              )}
            </div>

            {displayedUpcomingSessions.length > 0 ? (
              <div className="space-y-3">
                {displayedUpcomingSessions.map(session => {
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
                          <p className="text-[11px] text-gray-600 mt-1">Unit: {getSessionUnitLabel(session)}</p>
                          {awaitingChoice && (
                            <p className="text-[10px] text-amber-600 font-bold uppercase mt-1">Awaiting student choice</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold">{session.date}</p>
                        <p className="text-[10px] text-gray-500">{formatTimeOnly(session.date, session.time)}</p>
                        <p className="text-[10px] text-gray-500">Duration: {session.duration} minutes</p>
                        {student && (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              onOpenChat(student);
                            }}
                            className="mt-2 text-xs font-bold text-emerald-600"
                          >
                            Message
                          </button>
                        )}
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
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Session History</h3>
                <p className="mt-1 text-xs text-gray-500">These are your completed sessions</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={historyRange}
                  onChange={event => setHistoryRange(event.target.value as ReportRange)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600"
                >
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="all">All Time</option>
                </select>
                {filteredHistorySessions.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadHistory}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                  >
                    Download History
                  </button>
                )}
              </div>
            </div>

            {filteredHistorySessions.length > 0 ? (
              <div className="space-y-3">
                {filteredHistorySessions.map(session => {
                  const student = users.find(entry => entry.id === session.studentId);

                  return (
                    <div key={`past-${session.id}`} className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex justify-between items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                          {student?.avatar ? (
                            <img src={student.avatar} alt={student.fullName || 'Student'} className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{student?.fullName || 'Student'}</h4>
                          <p className="text-[10px] text-gray-600 font-bold uppercase">{session.subject}</p>
                          <p className="text-[11px] text-gray-500 mt-1">Unit: {getSessionUnitLabel(session)}</p>
                          <p className="text-[10px] text-gray-400 mt-1">Completed</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold">{session.date}</p>
                        <p className="text-[10px] text-gray-500">{formatTimeOnly(session.date, session.time)}</p>
                        <div className="mt-2 flex items-center justify-end gap-3">
                          {student && (
                            <button onClick={() => onOpenChat(student)} className="text-xs font-bold text-emerald-600">
                              Message
                            </button>
                          )}
                          <button onClick={() => handleDeleteSession(session.id)} className="text-xs font-bold text-red-600">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-gray-100 p-8 rounded-2xl text-center text-gray-400 text-sm">
                No session history in this range.
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'insights' && (
        <section className="space-y-4">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Performance Insights</h3>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={insightsRange}
                  onChange={event => setInsightsRange(event.target.value as ReportRange)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600"
                >
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="all">All Time</option>
                </select>
                <button
                  type="button"
                  onClick={handleDownloadPerformanceReport}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Download Performance Report
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Total Sessions Taught</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">{insightSessionsTaught}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Average Rating</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">★ {insightAverageRating}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Attendance Rate</p>
                <p className="mt-2 text-2xl font-bold text-violet-900">{insightAttendanceRate}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {renderProgress('Average Rating', `★ ${insightAverageRating}`, (insightAverageRating / 5) * 100, 'bg-amber-400')}
            {renderProgress('Attendance Rate', `${insightAttendanceRate}%`, insightAttendanceRate, 'bg-violet-500')}
            {renderProgress(
              'Sessions Taught',
              `${insightSessionsTaught}`,
              insightSessions.length > 0 ? (insightSessionsTaught / Math.max(insightSessions.length, 1)) * 100 : 0,
              'bg-emerald-500'
            )}
          </div>
        </section>
      )}

      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {actionMode === 'actions' ? 'Manage Session' : actionMode === 'cancel' ? 'Cancel Session' : actionMode === 'decline' ? 'Decline Request' : 'Suggest New Time'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedStudent?.fullName || 'Student'} - {formatSessionTopic(selectedSession)}
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
                  <p className="text-sm font-semibold text-emerald-700">{selectedSession.subject}</p>
                  <p className="text-xs text-gray-600 mt-1">Unit: {getSessionUnitLabel(selectedSession)}</p>
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

                {isPastSession(selectedSession) && (
                  <button
                    onClick={() => handleDeleteSession(selectedSession.id)}
                    className="w-full rounded-2xl border border-red-200 text-red-600 p-4 text-left"
                  >
                    <span className="block text-sm font-bold">Delete Session</span>
                    <span className="block text-xs text-red-400 mt-1">Remove this completed session from your list.</span>
                  </button>
                )}
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

            {actionMode === 'decline' && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-700">The student will be notified and guided on the next steps.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Quick Reason</label>
                  <div className="grid grid-cols-1 gap-2">
                    {['Not available', 'Schedule conflict', 'Other'].map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDeclineReason(option === 'Other' ? '' : option)}
                        className={`rounded-2xl border px-3 py-3 text-left text-sm ${
                          (option !== 'Other' && declineReason === option)
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Reason Details (Optional)</label>
                  <textarea
                    value={declineReason}
                    onChange={event => setDeclineReason(event.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-2xl text-sm h-28"
                    placeholder="Add a short reason if helpful."
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
                    onClick={handleDeclineSession}
                    disabled={isSubmitting}
                    className="flex-1 bg-red-600 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
                  >
                    Confirm Decline
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
