/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Google Workspace OAuth & Authentication Service.
 * Provides in-memory access token management and official Google sign-in workflows.
 */

import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { auth } from './firebase';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
// Set prompt to consent if needed so refreshed permissions are granted
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory token cache (Do NOT store in localStorage or sessionStorage per security guidelines)
let cachedAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;
let isSigningIn = false;

// Listeners for auth state changes across components
type AuthStateListener = (user: User | null, token: string | null) => void;
const listeners = new Set<AuthStateListener>();

export const addAuthListener = (listener: AuthStateListener) => {
  listeners.add(listener);
  // Immediate fire with current state
  listener(cachedGoogleUser, cachedAccessToken);
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener(cachedGoogleUser, cachedAccessToken);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
};

/**
 * Initialize auth state listener. Call this on app load.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && !user.isAnonymous) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        notifyListeners();
      } else if (!isSigningIn) {
        // User is known from Firebase session but token needs refresh on interactive action
        notifyListeners();
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedGoogleUser = null;
      cachedAccessToken = null;
      notifyListeners();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Sign in with Google using popup and capture Workspace OAuth access token
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) {
    throw new Error('Firebase Auth belum diinisialisasi.');
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error('Gagal memperoleh token akses Google dari Firebase Auth.');
    }

    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    notifyListeners();

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in Google error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Returns the in-memory access token or null
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Returns current authenticated Google user
 */
export const getCurrentGoogleUser = (): User | null => {
  return cachedGoogleUser;
};

/**
 * Sign out and clear cached token
 */
export const googleSignOut = async (): Promise<void> => {
  cachedAccessToken = null;
  cachedGoogleUser = null;
  if (auth) {
    await signOut(auth);
  }
  notifyListeners();
};
