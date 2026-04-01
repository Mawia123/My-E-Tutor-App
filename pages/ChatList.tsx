import React, { useEffect, useState } from 'react';
import { User, ChatMessage, UserRole } from '../types';
import { api } from '../services/api';

interface ChatProps {
  user: User; 
}

const ChatAvatar: React.FC<{ avatar?: string; name?: string; className: string }> = ({ avatar, name, className }) => {
  if (avatar) {
    return <img src={avatar} alt={name || 'User avatar'} className={`${className} object-cover`} />;
  }

  return (
    <div
      aria-hidden="true"
      className={`${className} bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300`}
    >
      <span className="text-lg leading-none"> </span>
    </div>
  );
};

export const ChatList: React.FC<ChatProps> = ({ user }) => {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const loadData = async () => {
    try {
      const [allMessages, allUsers] = await Promise.all([api.getMessages(), api.getUsers()]);
      setMessages(allMessages);
      setUsers(allUsers);
    } catch (error) {
      console.error('Failed to load chat data:', error);
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

  const chatUsersIds = Array.from(new Set([
    ...messages.filter(message => message.senderId === user.id).map(message => message.receiverId),
    ...messages.filter(message => message.receiverId === user.id).map(message => message.senderId),
  ]));

  const chatUsers = users.filter(entry => chatUsersIds.includes(entry.id));
  const availableChatUsers = users.filter(entry => {
    if (entry.id === user.id || !entry.isActive) return false;
    if (user.role === UserRole.STUDENT) return entry.role === UserRole.TUTOR && !!entry.isApproved;
    if (user.role === UserRole.TUTOR) return entry.role === UserRole.STUDENT;
    return entry.role !== UserRole.ADMIN;
  });

  const openChatWithUser = (chatUserId: string) => {
    setActiveChatId(chatUserId);
    setIsPickerOpen(false);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !activeChatId) return;

    const newMessage: ChatMessage = {
      id: Math.random().toString(36).slice(2, 11),
      senderId: user.id,
      receiverId: activeChatId,
      text: inputText.trim(),
      timestamp: Date.now(),
      read: false,
    };

    try {
      const created = await api.createMessage(newMessage);
      setMessages(current => [...current, created]);
      setInputText('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send the message.');
    }
  };

  const activeUser = users.find(entry => entry.id === activeChatId);
  const currentMessages = messages
    .filter(message =>
      (message.senderId === user.id && message.receiverId === activeChatId) ||
      (message.receiverId === user.id && message.senderId === activeChatId)
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (activeChatId) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] bg-white">
        <header className="p-4 border-b border-gray-100 flex items-center gap-3">
          <button onClick={() => setActiveChatId(null)} className="text-gray-400 text-xl leading-none">
            &larr;
          </button>
          <ChatAvatar avatar={activeUser?.avatar} name={activeUser?.fullName} className="w-8 h-8 rounded-full" />
          <h3 className="font-bold text-sm">{activeUser?.fullName}</h3>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {currentMessages.map(message => (
            <div key={message.id} className={`flex ${message.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                  message.senderId === user.id
                    ? 'bg-emerald-600 text-white rounded-tr-none'
                    : 'bg-gray-100 text-gray-800 rounded-tl-none'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {currentMessages.length === 0 && (
            <div className="text-center text-gray-400 py-10 text-sm">Start your conversation...</div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 bg-gray-50 border border-gray-200 px-4 py-2 rounded-full text-sm outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Type message..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            />
            <button
              onClick={handleSendMessage}
              className="px-4 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md text-sm font-semibold"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Messages</h2>
        {user.role !== UserRole.ADMIN && (
          <button
            onClick={() => setIsPickerOpen(true)}
            className="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Start Chat
          </button>
        )}
      </div>

      {chatUsers.length > 0 ? (
        <div className="space-y-1">
          {chatUsers.map(chatUser => {
            const lastMessage = messages
              .filter(message =>
                (message.senderId === user.id && message.receiverId === chatUser.id) ||
                (message.receiverId === user.id && message.senderId === chatUser.id)
              )
              .sort((a, b) => a.timestamp - b.timestamp)
              .pop();

            return (
              <button
                key={chatUser.id}
                onClick={() => openChatWithUser(chatUser.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-white rounded-3xl transition-all"
              >
                <ChatAvatar avatar={chatUser.avatar} name={chatUser.fullName} className="w-12 h-12 rounded-full" />
                <div className="flex-1 text-left">
                  <div className="flex justify-between gap-3">
                    <h4 className="font-bold text-sm text-gray-900">{chatUser.fullName}</h4>
                    <span className="text-[10px] text-gray-400">
                      {lastMessage ? new Date(lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1">{lastMessage?.text || 'No messages yet'}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 px-10">
          <div className="text-5xl mb-4 text-gray-200">Chat</div>
          <h3 className="text-gray-900 font-bold mb-1">No Messages Yet</h3>
          <p className="text-gray-500 text-xs">Reach out to a tutor or student to start chatting about your sessions.</p>
          {user.role !== UserRole.ADMIN && (
            <button
              onClick={() => setIsPickerOpen(true)}
              className="mt-5 bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Start Chat
            </button>
          )}
        </div>
      )}

      {isPickerOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5 gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {user.role === UserRole.STUDENT ? 'Choose a Tutor' : 'Start a Chat'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">Select someone to open a conversation.</p>
              </div>
              <button onClick={() => setIsPickerOpen(false)} className="text-gray-400 text-xl leading-none">
                &times;
              </button>
            </div>

            {availableChatUsers.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {availableChatUsers.map(chatUser => (
                  <button
                    key={chatUser.id}
                    onClick={() => openChatWithUser(chatUser.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50 transition-colors"
                  >
                    <ChatAvatar avatar={chatUser.avatar} name={chatUser.fullName} className="w-11 h-11 rounded-full" />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold text-gray-900">{chatUser.fullName}</p>
                      <p className="text-xs text-gray-500">{chatUser.subjects?.join(', ') || chatUser.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">
                No users are available to chat right now.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
