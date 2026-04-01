import { ChatMessage, TutoringSession, User, UserRole } from '../types';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = await response.text() || message;
    }
    throw new Error(message);
  }

  return response.json();
};

const normalizeUser = (rawUser: any): User => ({
  id: String(rawUser.id),
  fullName: rawUser.fullName || rawUser.name || '',
  email: rawUser.email || '',
  password: rawUser.password,
  role: rawUser.role as UserRole,
  bio: rawUser.bio || '',
  academicHistory: rawUser.academicHistory || '',
  subjects: Array.isArray(rawUser.subjects) ? rawUser.subjects : [],
  rating: rawUser.rating || 0,
  totalSessions: rawUser.totalSessions || 0,
  isApproved: rawUser.isApproved === true || rawUser.approved === 1,
  isActive: rawUser.isActive !== false,
  avatar: rawUser.avatar || '',
});

const normalizeSession = (rawSession: any): TutoringSession => ({
  id: String(rawSession.id),
  studentId: String(rawSession.studentId),
  tutorId: String(rawSession.tutorId),
  subject: rawSession.subject || '',
  date: rawSession.date || '',
  time: rawSession.time || '',
  duration: Number(rawSession.duration || 60),
  status: rawSession.status,
  notes: rawSession.notes || '',
  feedback: rawSession.feedback || '',
  rating: Number(rawSession.rating || 0),
  cancellationReason: rawSession.cancellationReason || '',
  rescheduleOptions: Array.isArray(rawSession.rescheduleOptions) ? rawSession.rescheduleOptions : [],
  createdAt: Number(rawSession.createdAt || Date.now()),
});

export const api = {
  async getUsers(): Promise<User[]> {
    const users = await request<any[]>('/users');
    return users.map(normalizeUser);
  },

  async getTutors(): Promise<User[]> {
    const tutors = await request<any[]>('/tutors');
    return tutors.map(normalizeUser);
  },

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = await request<any>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return normalizeUser(user);
  },

  async getSessions(): Promise<TutoringSession[]> {
    const sessions = await request<any[]>('/sessions');
    return sessions.map(normalizeSession);
  },

  async createSession(session: TutoringSession): Promise<TutoringSession> {
    const created = await request<any>('/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });
    return normalizeSession(created);
  },

  async updateSession(id: string, updates: Partial<TutoringSession>): Promise<TutoringSession> {
    const updated = await request<any>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return normalizeSession(updated);
  },

  async getMessages(): Promise<ChatMessage[]> {
    return request<ChatMessage[]>('/messages');
  },

  async createMessage(message: ChatMessage): Promise<ChatMessage> {
    return request<ChatMessage>('/messages', {
      method: 'POST',
      body: JSON.stringify(message),
    });
  },
};
