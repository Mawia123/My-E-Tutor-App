import React, { useEffect, useState } from 'react';
import { User, SessionStatus, TutoringSession, UserRole } from '../types';
import { getUnitsForSubject, SUBJECTS } from '../constants';
import { api } from '../services/api';
import { getTutorDailyTimetable, isPastSessionTime, isShortNoticeSession, meetsMinimumNoticeHours, SHORT_NOTICE_WINDOW_HOURS, isTutorAvailableForSlot } from '../services/schedule';

interface SearchProps {
  user: User;
  onViewTutorProfile: (tutor: User) => void;
  initialBookingTutor?: User | null;
  onInitialBookingHandled?: () => void;
}

export const SearchTutors: React.FC<SearchProps> = ({
  user,
  onViewTutorProfile,
  initialBookingTutor,
  onInitialBookingHandled,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookingTutor, setBookingTutor] = useState<User | null>(null);
  const [bookingData, setBookingData] = useState({ subject: '', unit: '', customUnit: '', date: '', time: '', duration: 60, notes: '' });
  const [allTutors, setAllTutors] = useState<User[]>([]);
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);
  const [slotConflict, setSlotConflict] = useState<TutoringSession | null>(null);
  const [checkingSlotConflict, setCheckingSlotConflict] = useState(false);
  const [slotConflictError, setSlotConflictError] = useState('');

  useEffect(() => {
    const loadTutors = async () => {
      setLoadingTutors(true);
      try {
        const [users, allSessions] = await Promise.all([api.getTutors(), api.getSessions()]);
        const backendTutors = users.filter((u: User) => u.role === UserRole.TUTOR && u.isApproved && u.isActive);

        setAllTutors(backendTutors);
        setSessions(allSessions);
      } catch (error) {
        console.error('Error loading tutors:', error);
        setAllTutors([]);
        setSessions([]);
      } finally {
        setLoadingTutors(false);
      }
    };

    loadTutors();
  }, []);

  useEffect(() => {
    if (!initialBookingTutor) return;

    openBookingModal(initialBookingTutor);
    onInitialBookingHandled?.();
  }, [initialBookingTutor, onInitialBookingHandled]);

  const today = new Date().toLocaleDateString('en-CA');
  const minimumNoticeHours = bookingTutor?.minimumNoticeHours || 6;
  const acceptsShortNoticeRequests = bookingTutor?.acceptsShortNoticeRequests ?? true;
  const earliestBookingDate = new Date(Date.now() + minimumNoticeHours * 60 * 60 * 1000).toLocaleDateString('en-CA');
  const selectedDate = bookingData.date || today;
  const selectedTutorTimetable = bookingTutor ? getTutorDailyTimetable(sessions, bookingTutor.id, selectedDate) : [];
  const availableUnits = getUnitsForSubject(bookingData.subject);
  const resolvedUnit = bookingData.customUnit.trim() || bookingData.unit;
  const selectedSlotInPast =
    bookingData.date && bookingData.time
      ? isPastSessionTime(bookingData.date, bookingData.time)
      : false;
  const selectedSlotTooSoon =
    bookingData.date && bookingData.time
      ? !selectedSlotInPast && !meetsMinimumNoticeHours(bookingData.date, bookingData.time, minimumNoticeHours)
      : false;
  const selectedSlotShortNotice =
    bookingData.date && bookingData.time
      ? !selectedSlotInPast && isShortNoticeSession(bookingData.date, bookingData.time)
      : false;
  const localSlotConflict =
    bookingTutor && bookingData.date && bookingData.time &&
    !isTutorAvailableForSlot(sessions, bookingTutor.id, {
      date: bookingData.date,
      time: bookingData.time,
      duration: bookingData.duration,
    });
  const selectedSlotConflict = bookingTutor && bookingData.date && bookingData.time ? (slotConflict || localSlotConflict) : null;
  const bookingRequestBlocked =
    checkingSlotConflict ||
    selectedSlotInPast ||
    selectedSlotTooSoon ||
    (selectedSlotShortNotice && !acceptsShortNoticeRequests) ||
    Boolean(selectedSlotConflict);

  useEffect(() => {
    let active = true;

    if (!bookingTutor || !bookingData.date || !bookingData.time) {
      setSlotConflict(null);
      setCheckingSlotConflict(false);
      setSlotConflictError('');
      return () => {
        active = false;
      };
    }

    if (selectedSlotInPast || selectedSlotTooSoon || (selectedSlotShortNotice && !acceptsShortNoticeRequests)) {
      setSlotConflict(null);
      setCheckingSlotConflict(false);
      setSlotConflictError('');
      return () => {
        active = false;
      };
    }

    setCheckingSlotConflict(true);
    setSlotConflictError('');

    api.checkTutorSlotConflict({
      tutorId: bookingTutor.id,
      date: bookingData.date,
      time: bookingData.time,
      duration: bookingData.duration,
    })
      .then(result => {
        if (!active) return;
        setSlotConflict(result.conflict || null);
        setSlotConflictError('');
      })
      .catch(error => {
        if (!active) return;
        console.error('Failed to validate slot conflict:', error);
        setSlotConflict(null);
        setSlotConflictError('');
      })
      .finally(() => {
        if (!active) return;
        setCheckingSlotConflict(false);
      });

    return () => {
      active = false;
    };
  }, [
    acceptsShortNoticeRequests,
    bookingData.date,
    bookingData.duration,
    bookingData.time,
    bookingTutor,
    selectedSlotInPast,
    selectedSlotShortNotice,
    selectedSlotTooSoon,
  ]);

  const tutorReviewCounts = sessions.reduce<Record<string, number>>((counts, session) => {
    if ((session.rating || 0) > 0) {
      counts[session.tutorId] = (counts[session.tutorId] || 0) + 1;
    }

    return counts;
  }, {});

  const tutors = allTutors.filter(u =>
    (selectedSubject === 'All' || u.subjects?.includes(selectedSubject)) &&
    (u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.subjects?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())))
  ).sort((left, right) => {
    const reviewCountDifference = (tutorReviewCounts[right.id] || 0) - (tutorReviewCounts[left.id] || 0);

    if (reviewCountDifference !== 0) {
      return reviewCountDifference;
    }

    const ratingDifference = (right.rating || 0) - (left.rating || 0);

    if (ratingDifference !== 0) {
      return ratingDifference;
    }

    return left.fullName.localeCompare(right.fullName);
  });

  const openBookingModal = (tutor: User) => {
    setBookingTutor(tutor);
    setSlotConflict(null);
    setCheckingSlotConflict(false);
    setSlotConflictError('');
    setBookingData({
      subject: tutor.subjects?.[0] || '',
      unit: '',
      customUnit: '',
      date: '',
      time: '',
      duration: 60,
      notes: '',
    });
  };

  const closeBookingModal = () => {
    setBookingTutor(null);
    setSlotConflict(null);
    setCheckingSlotConflict(false);
    setSlotConflictError('');
    setBookingData({ subject: '', unit: '', customUnit: '', date: '', time: '', duration: 60, notes: '' });
  };

  const handleBookSession = async () => {
    if (!bookingTutor || !bookingData.subject || !bookingData.date || !bookingData.time) {
      alert('Please choose a subject, date, and time for the session.');
      return;
    }

    if (!resolvedUnit) {
      alert('Please choose a unit or type your own unit for this session.');
      return;
    }

    if (isPastSessionTime(bookingData.date, bookingData.time)) {
      alert('You cannot book a session in the past. Please choose a future date and time.');
      return;
    }

    if (!meetsMinimumNoticeHours(bookingData.date, bookingData.time, minimumNoticeHours)) {
      alert(`This tutor requires at least ${minimumNoticeHours} hours notice.`);
      return;
    }

    if (isShortNoticeSession(bookingData.date, bookingData.time) && !acceptsShortNoticeRequests) {
      alert('This tutor does not accept short-notice requests.');
      return;
    }

    const newSession = {
      id: Math.random().toString(36).substr(2, 9),
      studentId: user.id,
      tutorId: bookingTutor.id,
      subject: bookingData.subject,
      unit: resolvedUnit,
      date: bookingData.date,
      time: bookingData.time,
      duration: bookingData.duration,
      status: SessionStatus.PENDING,
      notes: bookingData.notes,
      createdAt: Date.now()
    };

    try {
      try {
        const conflictResult = await api.checkTutorSlotConflict({
          tutorId: bookingTutor.id,
          date: bookingData.date,
          time: bookingData.time,
          duration: bookingData.duration,
        });

        if (conflictResult.hasConflict) {
          setSlotConflict(conflictResult.conflict || null);
          alert('This lecturer already has a booking at that time. Please choose another slot.');
          return;
        }
      } catch (error) {
        console.error('Failed to run pre-submit conflict check:', error);
      }

      const createdSession = await api.createSession(newSession);
      setSessions(current => [createdSession, ...current]);
      alert('Session requested successfully!');
      closeBookingModal();
    } catch (error) {
      console.error('Failed to book session:', error);
      alert(error instanceof Error ? error.message : 'Failed to request session. Please try again.');
    }
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

        {tutors.map(tutor => {
          const todaysBookings = getTutorDailyTimetable(sessions, tutor.id, today).length;
          const bookingLabel = todaysBookings > 0
            ? `${todaysBookings} booking(s) today`
            : 'No bookings today';

          return (
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
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    todaysBookings > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {bookingLabel}
                  </span>
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
        );
        })}

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
          <div className="bg-white w-full max-w-sm max-h-[calc(100vh-2rem)] rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold">Request Session</h3>
              <button onClick={closeBookingModal} className="text-gray-400 text-xl">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                  onChange={e => setBookingData({ ...bookingData, subject: e.target.value, unit: '', customUnit: '' })}
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
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                  value={bookingData.unit}
                  onChange={e => setBookingData({ ...bookingData, unit: e.target.value })}
                >
                  <option value="">
                    {availableUnits.length > 0 ? 'Select a unit' : 'Select a unit'}
                  </option>
                  {availableUnits.map(unit => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="w-full mt-2 p-2 border border-gray-200 rounded-lg text-sm"
                  placeholder={
                    bookingData.subject
                      ? 'Or type your own unit if it is not listed'
                      : 'Type your unit here even if no subject is selected yet'
                  }
                  value={bookingData.customUnit}
                  onChange={e => setBookingData({ ...bookingData, customUnit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                <input
                  type="date"
                  min={earliestBookingDate}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={bookingData.date}
                  onChange={e => setBookingData({ ...bookingData, date: e.target.value })}
                />
                <p className="mt-2 text-[11px] text-gray-500">
                  Minimum notice for this tutor: {minimumNoticeHours} hours.
                </p>
                <p className="mt-1 text-[11px] text-gray-500">
                  Advance booking recommended. Short-notice requests may require tutor approval.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Time</label>
                <input
                  type="time"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={bookingData.time}
                  onChange={e => setBookingData({ ...bookingData, time: e.target.value })}
                />
                {bookingData.date && bookingData.time && (
                  <p className={`mt-2 text-xs font-semibold ${
                    selectedSlotInPast || selectedSlotTooSoon || selectedSlotConflict || (selectedSlotShortNotice && !acceptsShortNoticeRequests)
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}>
                    {selectedSlotInPast
                      ? 'Please choose a future time for this booking.'
                      : selectedSlotTooSoon
                      ? `This tutor requires at least ${minimumNoticeHours} hours notice.`
                      : checkingSlotConflict
                      ? 'Checking for booking conflicts at this time slot...'
                      : slotConflictError
                      ? slotConflictError
                      : selectedSlotConflict
                      ? `${bookingTutor.fullName} already has a session at this time. Please choose a different time.`
                      : selectedSlotShortNotice && !acceptsShortNoticeRequests
                      ? 'This tutor does not accept short-notice requests.'
                      : selectedSlotShortNotice
                      ? `Short-notice session: tutor approval is required for requests inside ${SHORT_NOTICE_WINDOW_HOURS} hours.`
                      : 'No conflicting bookings found for this time slot.'}
                  </p>
                )}
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

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Daily Timetable</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedDate === today ? 'Today' : selectedDate} for {bookingTutor.fullName}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">
                    {selectedTutorTimetable.length} session(s)
                  </span>
                </div>

                {selectedTutorTimetable.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTutorTimetable.map(session => (
                      <div key={session.id} className="rounded-xl bg-white border border-gray-100 px-3 py-2">
                        <p className="text-xs font-bold text-gray-900">{session.subject}</p>
                        {session.unit && <p className="text-[11px] text-emerald-700 font-medium mt-1">{session.unit}</p>}
                        <p className="text-[11px] text-gray-500">
                          {session.time} for {session.duration} minutes
                        </p>
                        <p className="text-[10px] mt-1 font-bold uppercase text-emerald-600">{session.status}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 font-semibold">No bookings recorded for this day.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message to Tutor</label>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm h-24 resize-none"
                  placeholder="Tell the tutor what you need help with..."
                  value={bookingData.notes}
                  onChange={e => setBookingData({ ...bookingData, notes: e.target.value })}
                />
              </div>

            </div>

            <div className="p-6 pt-4 border-t border-gray-100 bg-white">
              <button
                onClick={handleBookSession}
                disabled={bookingRequestBlocked}
                className="w-full bg-emerald-600 text-white font-bold py-3 rounded-2xl shadow-lg disabled:opacity-50"
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
