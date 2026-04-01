
import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { BottomNav } from './components/Navigation';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { StudentDashboard } from './pages/StudentDashboard';
import { TutorDashboard } from './pages/TutorDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { SearchTutors } from './pages/SearchTutors';
import { ChatList } from './pages/ChatList';
import { Profile } from './pages/Profile';
import { api } from './services/api';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<'login' | 'register' | 'app'>('login');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);

  // Load user from session if available
  useEffect(() => {
    const savedUser = sessionStorage.getItem('logged_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      api.getUsers()
        .then(users => {
          const latestUser = users.find(entry => entry.id === parsedUser.id) || parsedUser;
          setUser(latestUser);
          sessionStorage.setItem('logged_user', JSON.stringify(latestUser));
          setCurrentPage('app');
        })
        .catch(() => {
          setUser(parsedUser);
          setCurrentPage('app');
        });
    }
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    sessionStorage.setItem('logged_user', JSON.stringify(u));
    setCurrentPage('app');
    setCurrentTab('dashboard');
    setSelectedProfileUser(null);
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('logged_user');
    setCurrentPage('login');
    setSelectedProfileUser(null);
  };

  const handleProfileUpdate = async (updates: Partial<User>) => {
    if (!user) return;

    const updatedUser = await api.updateUser(user.id, updates);
    setUser(updatedUser);
    sessionStorage.setItem('logged_user', JSON.stringify(updatedUser));
  };

  const handleTabChange = (tab: string) => {
    if (tab !== 'tutor-profile') {
      setSelectedProfileUser(null);
    }
    setCurrentTab(tab);
  };

  const handleViewTutorProfile = (tutor: User) => {
    setSelectedProfileUser(tutor);
    setCurrentTab('tutor-profile');
  };

  const renderAppContent = () => {
    if (!user) return null;

    switch (currentTab) {
      case 'dashboard':
        if (user.role === UserRole.ADMIN) return <AdminDashboard user={user} />;
        if (user.role === UserRole.TUTOR) return <TutorDashboard user={user} />;
        return <StudentDashboard user={user} setTab={handleTabChange} onViewTutorProfile={handleViewTutorProfile} />;
      case 'search':
        return <SearchTutors user={user} onViewTutorProfile={handleViewTutorProfile} />;
      case 'chat':
        return <ChatList user={user} />;
      case 'users':
        return <AdminDashboard user={user} showUsersOnly={true} />;
      case 'profile':
        return <Profile user={user} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />;
      case 'tutor-profile':
        if (!selectedProfileUser) {
          return <SearchTutors user={user} onViewTutorProfile={handleViewTutorProfile} />;
        }
        return (
          <Profile
            user={selectedProfileUser}
            mode="viewer"
            viewerLabel="Tutor Profile"
            onBack={() => {
              setSelectedProfileUser(null);
              handleTabChange('search');
            }}
            onLogout={handleLogout}
            onProfileUpdate={handleProfileUpdate}
          />
        );
      default:
        return <div className="p-4">Page under construction</div>;
    }
  };

  if (currentPage === 'login') {
    return <Login onLogin={handleLogin} onGoToRegister={() => setCurrentPage('register')} />;
  }

  if (currentPage === 'register') {
    return <Register onBack={() => setCurrentPage('login')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-xl">
      <header className="bg-emerald-600 text-white p-4 sticky top-0 z-40 shadow-sm">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">PeerTutoringPro</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-700 px-2 py-1 rounded-full uppercase tracking-wider font-semibold">
              {user?.role}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20 overflow-y-auto">
        {renderAppContent()}
      </main>

      {user && (
        <BottomNav 
          currentTab={currentTab} 
          setTab={handleTabChange} 
          role={user.role} 
        />
      )}
    </div>
  );
};

export default App;
