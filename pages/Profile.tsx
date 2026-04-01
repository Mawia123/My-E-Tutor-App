import React, { useEffect, useRef, useState } from 'react';
import { User, UserRole } from '../types';
import { SUBJECTS } from '../constants';

interface ProfileProps {
  user: User;
  mode?: 'editable' | 'viewer';
  viewerLabel?: string;
  onBack?: () => void;
  onLogout: () => void;
  onProfileUpdate: (updates: Partial<User>) => Promise<void> | void;
}

export const Profile: React.FC<ProfileProps> = ({
  user,
  mode = 'editable',
  viewerLabel,
  onBack,
  onLogout,
  onProfileUpdate,
}) => {
  const isViewerMode = mode === 'viewer';
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    avatar: user.avatar || '',
    bio: user.bio || '',
    academicHistory: user.academicHistory || '',
    subjects: user.subjects || [],
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFormData({
      avatar: user.avatar || '',
      bio: user.bio || '',
      academicHistory: user.academicHistory || '',
      subjects: user.subjects || [],
    });
  }, [user]);

  const handleSave = async () => {
    await onProfileUpdate(formData);
    setIsEditing(false);
    alert('Profile updated!');
  };

  const handleCancel = () => {
    setFormData({
      avatar: user.avatar || '',
      bio: user.bio || '',
      academicHistory: user.academicHistory || '',
      subjects: user.subjects || [],
    });
    setIsEditing(false);
  };

  const toggleSubject = (subject: string) => {
    if (formData.subjects.includes(subject)) {
      setFormData({ ...formData, subjects: formData.subjects.filter(s => s !== subject) });
    } else {
      setFormData({ ...formData, subjects: [...formData.subjects, subject] });
    }
  };

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setFormData(current => ({ ...current, avatar: result }));
    };
    reader.readAsDataURL(file);
  };

  const displayedAvatar = formData.avatar || user.avatar || '';

  return (
    <div className="p-4 space-y-6">
      {isViewerMode && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"
        >
          <span aria-hidden="true">&lt;</span>
          <span>{viewerLabel || 'Back'}</span>
        </button>
      )}

      <div className="text-center pt-6 pb-2">
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-3xl mx-auto shadow-xl border-4 border-white bg-gray-50 overflow-hidden flex items-center justify-center">
            {displayedAvatar ? (
              <img src={displayedAvatar} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">No Image</span>
            )}
          </div>
          <button
            onClick={() => !isViewerMode && isEditing && fileInputRef.current?.click()}
            className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center text-white text-xs ${
              !isViewerMode && isEditing ? 'bg-emerald-600 cursor-pointer' : 'bg-emerald-400 cursor-default'
            }`}
          >
            Edit
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelect}
          />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mt-4">{user.fullName}</h2>
        <p className="text-sm text-gray-500 font-medium uppercase tracking-widest">{user.role}</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm space-y-4 border border-gray-100">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-gray-900">Profile Details</h3>
          {!isViewerMode && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="text-xs text-emerald-600 font-bold">
              Edit
            </button>
          )}
        </div>

        {!isViewerMode && isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Profile Picture</label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl object-cover border border-gray-100 bg-gray-50 overflow-hidden flex items-center justify-center">
                  {displayedAvatar ? (
                    <img src={displayedAvatar} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-gray-300 uppercase">Empty</span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-emerald-50 text-emerald-700 font-bold text-sm px-4 py-2 rounded-xl"
                >
                  Upload Image
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bio</label>
              <textarea
                className="w-full p-3 border border-gray-200 rounded-2xl text-sm h-24"
                value={formData.bio}
                onChange={e => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Tell others about your academic interests and strengths."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Academic History</label>
              <textarea
                className="w-full p-3 border border-gray-200 rounded-2xl text-sm h-28"
                value={formData.academicHistory}
                onChange={e => setFormData({ ...formData, academicHistory: e.target.value })}
                placeholder="Add your school background, major, relevant coursework, awards, or tutoring experience."
              />
            </div>

            {user.role === UserRole.TUTOR && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase">My Subjects</p>
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map(subject => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                        formData.subjects.includes(subject) ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleSave} className="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-xl text-sm">
                Save Changes
              </button>
              <button onClick={handleCancel} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-xl text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">Personal Bio</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {user.bio || 'No bio added yet. Tell others about your academic interests.'}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-1">Academic History</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {user.academicHistory || 'No academic history added yet.'}
              </p>
            </div>

            {user.role === UserRole.TUTOR && (
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2">Subjects</h4>
                <div className="flex flex-wrap gap-2">
                  {(user.subjects || []).length > 0 ? (
                    user.subjects?.map(subject => (
                      <span key={subject} className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        {subject}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">No subjects added yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!isViewerMode && (
        <button
          onClick={onLogout}
          className="w-full bg-white border border-red-100 text-red-600 font-bold py-4 rounded-3xl shadow-sm mb-4"
        >
          Sign Out
        </button>
      )}
    </div>
  );
};
