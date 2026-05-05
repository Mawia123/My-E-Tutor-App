import { SessionStatus, TutoringSession } from '../types';

const BLOCKING_STATUSES = new Set<SessionStatus>([
  SessionStatus.PENDING,
  SessionStatus.ACCEPTED,
  SessionStatus.COMPLETED,
]);

const DAILY_TIMETABLE_STATUSES = new Set<SessionStatus>([
  SessionStatus.PENDING,
  SessionStatus.ACCEPTED,
]);

export const SHORT_NOTICE_WINDOW_HOURS = 24;
const HOUR_IN_MS = 60 * 60 * 1000;
const ADVANCE_BOOKING_WINDOW_MS = SHORT_NOTICE_WINDOW_HOURS * HOUR_IN_MS;

const toDateTime = (date: string, time: string) => new Date(`${date}T${time}:00`);

export const getSessionStartTime = (date: string, time: string) => toDateTime(date, time).getTime();

export const isBlockingSession = (session: TutoringSession) => BLOCKING_STATUSES.has(session.status);

export const isTimetableSession = (session: TutoringSession) => DAILY_TIMETABLE_STATUSES.has(session.status);

export const isPastSessionTime = (date: string, time: string, now = Date.now()) => {
  const sessionStart = getSessionStartTime(date, time);

  if (Number.isNaN(sessionStart)) {
    return false;
  }

  return sessionStart < now;
};

export const isUpcomingSession = (session: Pick<TutoringSession, 'date' | 'time'>, now = Date.now()) =>
  !isPastSessionTime(session.date, session.time, now);

export const isPastSession = (session: Pick<TutoringSession, 'date' | 'time'>, now = Date.now()) =>
  isPastSessionTime(session.date, session.time, now);

export const meetsAdvanceBookingWindow = (
  date: string,
  time: string,
  now = Date.now(),
  minimumLeadTimeMs = ADVANCE_BOOKING_WINDOW_MS
) => {
  const sessionStart = getSessionStartTime(date, time);

  if (Number.isNaN(sessionStart)) {
    return false;
  }

  return sessionStart - now >= minimumLeadTimeMs;
};

export const meetsMinimumNoticeHours = (
  date: string,
  time: string,
  minimumNoticeHours: number,
  now = Date.now()
) => meetsAdvanceBookingWindow(date, time, now, minimumNoticeHours * HOUR_IN_MS);

export const isShortNoticeSession = (date: string, time: string, now = Date.now()) =>
  !isPastSessionTime(date, time, now) && !meetsAdvanceBookingWindow(date, time, now);

export const sessionsOverlap = (
  left: Pick<TutoringSession, 'date' | 'time' | 'duration'>,
  right: Pick<TutoringSession, 'date' | 'time' | 'duration'>
) => {
  if (left.date !== right.date) return false;

  const leftStart = getSessionStartTime(left.date, left.time);
  const rightStart = getSessionStartTime(right.date, right.time);

  if (Number.isNaN(leftStart) || Number.isNaN(rightStart)) {
    return false;
  }

  const leftEnd = leftStart + left.duration * 60_000;
  const rightEnd = rightStart + right.duration * 60_000;

  return leftStart < rightEnd && rightStart < leftEnd;
};

export const getTutorBlockingSessions = (sessions: TutoringSession[], tutorId: string) =>
  sessions.filter(session => session.tutorId === tutorId && isBlockingSession(session));

export const getTutorDailyTimetable = (sessions: TutoringSession[], tutorId: string, date: string) =>
  sessions
    .filter(session => session.tutorId === tutorId && session.date === date && isTimetableSession(session))
    .sort((first, second) => `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`));

export const isTutorAvailableForSlot = (
  sessions: TutoringSession[],
  tutorId: string,
  slot: Pick<TutoringSession, 'date' | 'time' | 'duration'>,
  excludeSessionId?: string
) =>
  !getTutorBlockingSessions(sessions, tutorId).some(
    session => session.id !== excludeSessionId && sessionsOverlap(session, slot)
  );
