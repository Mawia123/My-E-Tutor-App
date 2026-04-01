import React, { useEffect, useState } from 'react';
import { User, UserRole, TutoringSession } from '../types';
import { api } from '../services/api';

interface AdminProps {
  user: User;
  showUsersOnly?: boolean;
}

export const AdminDashboard: React.FC<AdminProps> = ({ user, showUsersOnly }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<TutoringSession[]>([]);

  const loadData = async () => {
    try {
      const [allUsers, allSessions] = await Promise.all([api.getUsers(), api.getSessions()]);
      setUsers(allUsers);
      setSessions(allSessions);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    await api.updateUser(id, { isActive: !currentStatus });
    await loadData();
  };

  const handleApproveTutor = async (id: string) => {
    await api.updateUser(id, { isApproved: true });
    await loadData();
    alert('Tutor approved!');
  };

  const handleApproveAllTutors = async () => {
    const pendingTutorIds = users
      .filter(entry => entry.role === UserRole.TUTOR && !entry.isApproved)
      .map(entry => entry.id);

    await Promise.all(pendingTutorIds.map(id => api.updateUser(id, { isApproved: true })));
    await loadData();
    alert(`${pendingTutorIds.length} tutor(s) approved!`);
  };

  if (showUsersOnly) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold">User Management</h2>
        <div className="space-y-3">
          {users.filter(entry => entry.id !== user.id).map(entry => (
            <div key={entry.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {entry.avatar ? <img src={entry.avatar} className="w-10 h-10 rounded-full" /> : null}
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{entry.fullName}</h4>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">{entry.role}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {entry.role === UserRole.TUTOR && !entry.isApproved && (
                  <button
                    onClick={() => handleApproveTutor(entry.id)}
                    className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-full"
                  >
                    Approve
                  </button>
                )}
                <button
                  onClick={() => handleToggleStatus(entry.id, entry.isActive)}
                  className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                    entry.isActive ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'
                  }`}
                >
                  {entry.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <header className="bg-emerald-900 text-white p-6 rounded-3xl">
        <h2 className="text-xl font-bold">Admin Panel</h2>
        <p className="text-emerald-300 text-sm mt-1">Platform overview and monitoring</p>

        <div className="grid grid-cols-3 gap-4 mt-6 text-center">
          <div className="bg-emerald-800 p-3 rounded-2xl">
            <p className="text-xs text-emerald-400 uppercase font-bold">Users</p>
            <p className="text-xl font-bold">{users.length}</p>
          </div>
          <div className="bg-emerald-800 p-3 rounded-2xl">
            <p className="text-xs text-emerald-400 uppercase font-bold">Tutors</p>
            <p className="text-xl font-bold">{users.filter(entry => entry.role === UserRole.TUTOR).length}</p>
          </div>
          <div className="bg-emerald-800 p-3 rounded-2xl">
            <p className="text-xs text-emerald-400 uppercase font-bold">Sessions</p>
            <p className="text-xl font-bold">{sessions.length}</p>
          </div>
        </div>
      </header>

      <section>
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Recent Activity</h3>
        <div className="space-y-3">
          {sessions.slice(0, 5).map(session => {
            const student = users.find(entry => entry.id === session.studentId);
            const tutor = users.find(entry => entry.id === session.tutorId);
            return (
              <div key={session.id} className="bg-white border-l-4 border-emerald-500 p-3 rounded-r-2xl shadow-sm text-xs">
                <p className="text-gray-500">
                  <span className="font-bold text-gray-900">{student?.fullName}</span> booked a
                  <span className="font-bold text-emerald-600"> {session.subject} </span>
                  session with <span className="font-bold text-gray-900">{tutor?.fullName}</span>
                </p>
                <p className="text-[10px] mt-1 text-gray-400">{session.date}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Pending Tutor Requests</h3>
          {users.some(entry => entry.role === UserRole.TUTOR && !entry.isApproved) && (
            <button
              onClick={handleApproveAllTutors}
              className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100"
            >
              Approve all
            </button>
          )}
        </div>
        {users.filter(entry => entry.role === UserRole.TUTOR && !entry.isApproved).map(entry => (
          <div key={entry.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between mb-2 shadow-sm">
            <div className="flex items-center gap-3">
              {entry.avatar ? <img src={entry.avatar} className="w-10 h-10 rounded-full" /> : null}
              <div>
                <h4 className="text-sm font-bold text-gray-900">{entry.fullName}</h4>
                <p className="text-[10px] text-gray-400">{entry.email}</p>
              </div>
            </div>
            <button
              onClick={() => handleApproveTutor(entry.id)}
              className="bg-emerald-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-full"
            >
              Approve
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};
