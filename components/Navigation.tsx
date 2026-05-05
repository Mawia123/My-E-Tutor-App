import React from 'react';
import { UserRole } from '../types';

interface NavProps {
  currentTab: string;
  setTab: (tab: string) => void;
  role: UserRole;
  unreadMessageCount?: number;
}

export const BottomNav: React.FC<NavProps> = ({ currentTab, setTab, role, unreadMessageCount = 0 }) => {
  const tabs = role === UserRole.TUTOR
    ? [
        { id: 'dashboard', label: 'Sessions', icon: '🗓' },
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
    <div className="fixed bottom-0 left-0 right-0 z-50 px-0 sm:px-2">
      <nav className="w-full bg-white border-t border-gray-200 flex items-center h-16 px-2 shadow-[0_-4px_18px_rgba(15,23,42,0.06)] sm:max-w-md sm:mx-auto sm:rounded-t-2xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 min-w-0 transition-colors ${
              currentTab === tab.id ? 'text-emerald-600' : 'text-gray-500'
            }`}
          >
            <span className="relative text-xl">
              {tab.icon}
              {tab.id === 'chat' && unreadMessageCount > 0 && (
                <span className="absolute -top-2 -right-3 min-w-5 h-5 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </span>
              )}
            </span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
