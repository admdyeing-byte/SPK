/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Official Google Sign-In Button and User Profile Badge.
 * Adheres strictly to Google Identity branding guidelines.
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { googleSignIn, googleSignOut, getCurrentGoogleUser, getAccessToken, addAuthListener } from '../googleAuth';
import { LogOut, CheckCircle2, RefreshCw } from 'lucide-react';

interface GoogleSignInButtonProps {
  onSuccess?: (user: User, token: string) => void;
  compact?: boolean;
  className?: string;
}

export default function GoogleSignInButton({
  onSuccess,
  compact = false,
  className = '',
}: GoogleSignInButtonProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(getCurrentGoogleUser());
  const [hasToken, setHasToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Check initial token
    getAccessToken().then((token) => {
      setHasToken(!!token);
    });

    const unsubscribe = addAuthListener((user, token) => {
      setCurrentUser(user);
      setHasToken(!!token);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setHasToken(true);
        if (onSuccess) {
          onSuccess(result.user, result.accessToken);
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Gagal login Google. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await googleSignOut();
      setHasToken(false);
    } catch (err: any) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentUser && hasToken) {
    return (
      <div className={`flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 shadow-xs ${className}`}>
        {currentUser.photoURL ? (
          <img
            src={currentUser.photoURL}
            alt={currentUser.displayName || 'Google Account'}
            className="w-6 h-6 rounded-full border border-slate-300 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
            {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'G'}
          </div>
        )}
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-[160px]">
              {currentUser.displayName || currentUser.email}
            </span>
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
          </div>
          {!compact && (
            <span className="text-[10px] text-slate-500 truncate max-w-[140px] sm:max-w-[180px]">
              {currentUser.email}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isLoading}
          title="Keluar dari Akun Google"
          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
        >
          {isLoading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={isLoading}
        className="inline-flex items-center justify-center gap-2.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs cursor-pointer transition disabled:opacity-50"
      >
        {isLoading ? (
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        ) : (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
        )}
        <span>{compact ? 'Login Google' : 'Masuk dengan Google'}</span>
      </button>

      {errorMsg && (
        <span className="text-[10px] text-rose-600 mt-1 max-w-[200px] leading-tight">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
