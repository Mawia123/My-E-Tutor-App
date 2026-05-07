
import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { BottomNav } from './components/Navigation';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { StudentDashboard } from './pages/StudentDashboard';
import { TutorDashboard } from './pages/TutorDashboard';
import { SearchTutors } from './pages/SearchTutors';
import { ChatList } from './pages/ChatList';
import { Profile } from './pages/Profile';
import { api } from './services/api';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<'login' | 'register' | 'app'>('login');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);
  const [profileReturnTab, setProfileReturnTab] = useState<string>('search');
  const [pendingBookingTutor, setPendingBookingTutor] = useState<User | null>(null);
  const [pendingChatUser, setPendingChatUser] = useState<User | null>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [isChatConversationOpen, setIsChatConversationOpen] = useState(false);

  const refreshUnreadMessageCount = async (userId: string) => {
    try {
      const messages = await api.getMessages();
      const unreadCount = messages.filter(message => message.receiverId === userId && !message.read).length;
      setUnreadMessageCount(unreadCount);
    } catch (error) {
      console.error('Failed to refresh unread messages:', error);
    }
  };

  useEffect(() => {
    if (currentPage !== 'app' || currentTab !== 'profile' || !user?.id) return;

    api.getUsers()
      .then(users => {
        const latestUser = users.find(entry => entry.id === user.id);
        if (!latestUser) return;

        setUser(currentUser => {
          if (!currentUser || currentUser.id !== latestUser.id) {
            return currentUser;
          }

          return latestUser;
        });
      })
      .catch(error => {
        console.error('Failed to refresh profile user:', error);
      });
  }, [currentPage, currentTab, user?.id]);

  useEffect(() => {
    if (currentPage !== 'app' || !user?.id) return;

    const refreshCurrentUser = () => {
      api.getUsers()
        .then(users => {
          const latestUser = users.find(entry => entry.id === user.id);
          if (!latestUser) return;

          setUser(currentUser => {
            if (!currentUser || currentUser.id !== latestUser.id) {
              return currentUser;
            }

            return latestUser;
          });
        })
        .catch(error => {
          console.error('Failed to refresh current user:', error);
        });
    };

    refreshCurrentUser();
    const intervalId = window.setInterval(refreshCurrentUser, 5000);

    return () => window.clearInterval(intervalId);
  }, [currentPage, user?.id]);

  useEffect(() => {
    if (currentPage !== 'app' || !user?.id) {
      setUnreadMessageCount(0);
      return;
    }

    void refreshUnreadMessageCount(user.id);
    const intervalId = window.setInterval(() => {
      void refreshUnreadMessageCount(user.id);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [currentPage, user?.id]);

  const handleLogin = (u: User) => {
    setUser(u);
    setCurrentPage('app');
    setCurrentTab('dashboard');
    setSelectedProfileUser(null);
    setProfileReturnTab('dashboard');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Failed to logout cleanly:', error);
    }

    setUser(null);
    setCurrentPage('login');
    setSelectedProfileUser(null);
    setProfileReturnTab('search');
  };

  const handleProfileUpdate = async (updates: Partial<User>) => {
    if (!user) return;

    const updatedUser = await api.updateUser(user.id, updates);
    setUser(updatedUser);
  };

  const handleTabChange = (tab: string) => {
    if (tab !== 'tutor-profile') {
      setSelectedProfileUser(null);
    }
    if (tab !== 'search') {
      setPendingBookingTutor(null);
    }
    if (tab !== 'chat') {
      setPendingChatUser(null);
      setIsChatConversationOpen(false);
    }
    setCurrentTab(tab);
  };

  const handleViewTutorProfile = (tutor: User) => {
    setSelectedProfileUser(tutor);
    setProfileReturnTab(currentTab);
    setCurrentTab('tutor-profile');
  };

  const handleViewChatProfile = (profileUser: User) => {
    setSelectedProfileUser(profileUser);
    setProfileReturnTab('chat');
    setCurrentTab('tutor-profile');
  };

  const handleOpenChat = (chatUser: User) => {
    setPendingChatUser(chatUser);
    setCurrentTab('chat');
  };

  const renderAppContent = () => {
    if (!user) return null;

    switch (currentTab) {
      case 'dashboard':
        if (user.role === UserRole.TUTOR) {
          return <TutorDashboard user={user} onOpenChat={handleOpenChat} />;
        }
        return (
          <StudentDashboard
            user={user}
            setTab={handleTabChange}
            onViewTutorProfile={handleViewTutorProfile}
            onOpenChat={handleOpenChat}
          />
        );
      case 'search':
        return (
          <SearchTutors
            user={user}
            onViewTutorProfile={handleViewTutorProfile}
            initialBookingTutor={pendingBookingTutor}
            onInitialBookingHandled={() => setPendingBookingTutor(null)}
          />
        );
      case 'chat':
        return (
          <ChatList
            user={user}
            onViewProfile={handleViewChatProfile}
            initialChatUser={pendingChatUser}
            onMessagesUpdated={() => void refreshUnreadMessageCount(user.id)}
            onActiveConversationChange={setIsChatConversationOpen}
          />
        );
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
            viewerLabel={selectedProfileUser.role === UserRole.TUTOR ? 'Tutor Profile' : 'Student Profile'}
            onBookTutor={(tutor) => {
              setPendingBookingTutor(tutor);
              setSelectedProfileUser(null);
              setCurrentTab('search');
            }}
            onBack={() => {
              setSelectedProfileUser(null);
              handleTabChange(profileReturnTab);
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
    <div className="w-full min-h-dvh bg-gray-50 flex flex-col relative overflow-x-hidden sm:max-w-md sm:mx-auto sm:min-h-screen sm:shadow-xl">
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

      <main className={`flex-1 overflow-y-auto overflow-x-hidden ${isChatConversationOpen ? 'pb-0' : 'pb-24'}`}>
        {renderAppContent()}
      </main>

      {user && !isChatConversationOpen && (
        <BottomNav 
          currentTab={currentTab} 
          setTab={handleTabChange} 
          role={user.role} 
          unreadMessageCount={unreadMessageCount}
        />
      )}
    </div>
  );
};

export default App;
