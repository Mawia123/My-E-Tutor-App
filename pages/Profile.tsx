import React, { useEffect, useRef, useState } from 'react';
import { TutoringSession, User, UserRole } from '../types';
import { SUBJECTS } from '../constants';
import { api } from '../services/api';

interface ProfileProps {
  user: User;
  mode?: 'editable' | 'viewer';
  viewerLabel?: string;
  onBack?: () => void;
  onBookTutor?: (tutor: User) => void;
  onLogout: () => void;
  onProfileUpdate: (updates: Partial<User>) => Promise<void> | void;
}

export const Profile: React.FC<ProfileProps> = ({
  user,
  mode = 'editable',
  viewerLabel,
  onBack,
  onBookTutor,
  onLogout,
  onProfileUpdate,
}) => {
  const isViewerMode = mode === 'viewer';
  const renderStars = (rating?: number) => '⭐'.repeat(Math.max(0, Math.min(5, Math.round(rating || 0))));
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [reviews, setReviews] = useState<TutoringSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    avatar: user.avatar || '',
    bio: user.bio || '',
    academicHistory: user.academicHistory || '',
    subjects: user.subjects || [],
    minimumNoticeHours: user.minimumNoticeHours || 6,
    acceptsShortNoticeRequests: user.acceptsShortNoticeRequests ?? true,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) return;

    setFormData({
      avatar: user.avatar || '',
      bio: user.bio || '',
      academicHistory: user.academicHistory || '',
      subjects: user.subjects || [],
      minimumNoticeHours: user.minimumNoticeHours || 6,
      acceptsShortNoticeRequests: user.acceptsShortNoticeRequests ?? true,
    });
  }, [isEditing, user]);

  useEffect(() => {
    api.getUsers()
      .then(setUsers)
      .catch(error => {
        console.error('Failed to load users for reviews:', error);
      });
  }, []);

  useEffect(() => {
    if (user.role !== UserRole.TUTOR) {
      setReviews([]);
      return;
    }

    api.getSessions()
      .then(allSessions => {
        const tutorReviews = allSessions
          .filter(session => session.tutorId === user.id && ((session.feedback || '').trim() || (session.rating || 0) > 0))
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, 5);

        setReviews(tutorReviews);
      })
      .catch(error => {
        console.error('Failed to load tutor reviews:', error);
      });
  }, [user.id, user.role]);

  const resizeImageFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Failed to read the selected image.'));
      reader.onload = () => {
        const source = typeof reader.result === 'string' ? reader.result : '';
        if (!source) {
          reject(new Error('Failed to load the selected image.'));
          return;
        }

        const image = new Image();
        image.onerror = () => reject(new Error('The selected file is not a valid image.'));
        image.onload = () => {
          const maxDimension = 1200;
          const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
          const targetWidth = Math.max(1, Math.round(image.width * scale));
          const targetHeight = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement('canvas');

          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Failed to process the selected image.'));
            return;
          }

          // Fill a white background so PNGs with transparency still export cleanly as JPEG.
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, targetWidth, targetHeight);
          context.drawImage(image, 0, 0, targetWidth, targetHeight);

          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };

        image.src = source;
      };

      reader.readAsDataURL(file);
    });

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await onProfileUpdate(formData);
      setIsEditing(false);
      alert('Profile updated!');
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert(error instanceof Error ? error.message : 'Failed to update the profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      avatar: user.avatar || '',
      bio: user.bio || '',
      academicHistory: user.academicHistory || '',
      subjects: user.subjects || [],
      minimumNoticeHours: user.minimumNoticeHours || 6,
      acceptsShortNoticeRequests: user.acceptsShortNoticeRequests ?? true,
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

  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const resizedAvatar = await resizeImageFile(file);
      setFormData(current => ({ ...current, avatar: resizedAvatar }));
    } catch (error) {
      console.error('Failed to prepare selected image:', error);
      alert(error instanceof Error ? error.message : 'Failed to prepare the selected image.');
    } finally {
      event.target.value = '';
    }
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
                  type="button"
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
              <div className="space-y-4">
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

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Minimum Notice</label>
                  <select
                    className="w-full p-3 border border-gray-200 rounded-2xl text-sm bg-white"
                    value={formData.minimumNoticeHours}
                    onChange={e => setFormData({ ...formData, minimumNoticeHours: Number(e.target.value) })}
                  >
                    {[2, 3, 6, 12, 24].map(hours => (
                      <option key={hours} value={hours}>
                        {hours} hours
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-gray-200 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acceptsShortNoticeRequests}
                    onChange={e => setFormData({ ...formData, acceptsShortNoticeRequests: e.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-bold text-gray-900">Accept short-notice requests</span>
                    <span className="block text-xs text-gray-500 mt-1">Allow requests inside 24 hours, subject to your approval.</span>
                  </span>
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-xl text-sm disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-xl text-sm disabled:opacity-60"
              >
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
              <div className="space-y-4">
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Minimum Notice</p>
                    <p className="text-sm font-bold text-gray-900">{user.minimumNoticeHours || 6} hours</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Short Notice</p>
                    <p className="text-sm font-bold text-gray-900">
                      {user.acceptsShortNoticeRequests ?? true ? 'Allowed with approval' : 'Not accepted'}
                    </p>
                  </div>
                </div>

                <div className="pb-20">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Student Feedback</h4>
                  {reviews.length > 0 ? (
                    <div className="space-y-3">
                      {reviews.map(review => (
                        <div key={review.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                            {review.reviewIsAnonymous
                              ? 'Anonymous Student'
                              : (users.find(entry => entry.id === review.studentId)?.fullName || 'Student')}
                          </p>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-gray-900">{review.subject}</p>
                            <span className="text-xs font-bold text-amber-600">{renderStars(review.rating)}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1">{review.date}</p>
                          {review.feedback?.trim() ? (
                            <p className="text-sm text-gray-600 leading-relaxed mt-2">
                              {review.feedback}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-sm italic text-emerald-900 leading-relaxed">
                        Feedback will appear here after sessions.
                      </p>
                    </div>
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

      {isViewerMode && user.role === UserRole.TUTOR && onBookTutor && (
        <div className="sticky bottom-24 z-20">
          <button
            type="button"
            onClick={() => onBookTutor(user)}
            className="w-full bg-emerald-600 text-white font-bold py-4 rounded-3xl shadow-xl"
          >
            Book Session
          </button>
        </div>
      )}
    </div>
  );
};
