
import React from 'react';
import { UserRole } from '../types';

interface NavProps {
  currentTab: string;
  setTab: (tab: string) => void;
  role: UserRole;
}

export const BottomNav: React.FC<NavProps> = ({ currentTab, setTab, role }) => {
  const tabs = role === UserRole.ADMIN 
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'users', label: 'Users', icon: '👥' },
        { id: 'profile', label: 'Profile', icon: '👤' }
      ]
    : role === UserRole.TUTOR
    ? [
        { id: 'dashboard', label: 'Sessions', icon: '📅' },
        { id: 'chat', label: 'Messages', icon: '💬' },
        { id: 'profile', label: 'Profile', icon: '👤' }
      ]
    : [
        { id: 'dashboard', label: 'Home', icon: '🏠' },
        { id: 'search', label: 'Search', icon: '🔍' },
        { id: 'chat', label: 'Chat', icon: '💬' },
        { id: 'profile', label: 'Profile', icon: '👤' }
      ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-2">
      <nav className="max-w-md mx-auto bg-white border-t border-gray-200 flex items-center h-16 px-2 shadow-[0_-4px_18px_rgba(15,23,42,0.06)] rounded-t-2xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 min-w-0 transition-colors ${
              currentTab === tab.id ? 'text-emerald-600' : 'text-gray-500'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
