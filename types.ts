
export enum UserRole {
  STUDENT = 'STUDENT',
  TUTOR = 'TUTOR'
}

export enum SessionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface RescheduleOption {
  date: string;
  time: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  bio?: string;
  academicHistory?: string;
  subjects?: string[];
  rating?: number;
  totalSessions?: number;
  isApproved?: boolean;
  minimumNoticeHours?: number;
  acceptsShortNoticeRequests?: boolean;
  isActive: boolean;
  avatar?: string;
}

export interface TutoringSession {
  id: string;
  studentId: string;
  tutorId: string;
  subject: string;
  unit?: string;
  date: string;
  time: string;
  duration: number; // in minutes
  status: SessionStatus;
  notes?: string;
  feedback?: string;
  rating?: number;
  reviewIsAnonymous?: boolean;
  cancellationReason?: string;
  rescheduleOptions?: RescheduleOption[];
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: number;
  read: boolean;
}

export interface AppState {
  currentUser: User | null;
  users: User[];
  sessions: TutoringSession[];
  messages: ChatMessage[];
}
