import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@fakash/shared';

export const UserMenu: React.FC = () => {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    navigate('/');
  };

  // Extract display name from metadata or email
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'المستخدم';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="قائمة المستخدم"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary-main to-secondary-light flex items-center justify-center text-sm font-bold">
          {initials}
        </div>
        <span className="text-sm font-medium hidden sm:block">{displayName}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 mt-2 w-64 glass rounded-2xl overflow-hidden z-50 shadow-lg">
            {/* User info */}
            <div className="p-4 border-b border-white/10">
              <p className="font-semibold text-sm">{displayName}</p>
              <p className="text-xs text-white/60 mt-1">{user.email}</p>
            </div>

            {/* Menu items */}
            <div className="p-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/profile');
                }}
                className="w-full text-right px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                الملف الشخصي
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/create');
                }}
                className="w-full text-right px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                إنشاء لعبة جديدة
              </button>

              <div className="border-t border-white/10 my-2"></div>

              <button
                onClick={handleSignOut}
                className="w-full text-right px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-sm text-red-400 flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                تسجيل الخروج
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
