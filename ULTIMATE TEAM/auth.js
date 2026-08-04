/* ==========================================================================
   AUTHENTICATION MANAGER
   Handles login, registration, password resets, and session state.
   ========================================================================== */

import { auth } from './firebase.js';
import { createUserProfile } from './database.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/**
 * Maps Firebase Auth error codes to user-friendly messages.
 * @param {string} errorCode - The Firebase error code.
 * @returns {string} Clean, readable error message.
 */
function getAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/email-already-in-use':
            return 'This email is already registered. Please log in instead.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Your password is too weak. It must be at least 6 characters.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Invalid email or password. Please try again.';
        case 'auth/too-many-requests':
            return 'Too many failed login attempts. Please try again later or reset your password.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection.';
        default:
            return 'An unexpected authentication error occurred. Please try again.';
    }
}

/**
 * Registers a new user, creates their Auth profile, and builds their Database profile.
 * @param {string} email - User's email.
 * @param {string} password - User's chosen password.
 * @param {string} clubName - The name of their Ultimate Team club.
 * @returns {Promise<Object>} An object containing { success, user, error }.
 */
export async function registerUser(email, password, clubName) {
    try {
        if (!clubName || clubName.trim().length < 3) {
            throw new Error('Club name must be at least 3 characters long.');
        }

        // 1. Create the user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Update their Auth profile with the club name as displayName
        await updateProfile(user, { displayName: clubName.trim() });

        // 3. Initialize their database profile (gives them starting coins, stats, empty club)
        await createUserProfile(user.uid, clubName.trim(), email);

        return { success: true, user: user, error: null };
    } catch (error) {
        console.error('[Auth API] Registration Error:', error);
        // Distinguish between our custom errors and Firebase errors
        const errorMessage = error.code ? getAuthErrorMessage(error.code) : error.message;
        return { success: false, user: null, error: errorMessage };
    }
}

/**
 * Logs in an existing user.
 * @param {string} email - User's email.
 * @param {string} password - User's password.
 * @returns {Promise<Object>} An object containing { success, user, error }.
 */
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user, error: null };
    } catch (error) {
        console.error('[Auth API] Login Error:', error);
        return { success: false, user: null, error: getAuthErrorMessage(error.code) };
    }
}

/**
 * Logs out the current user and clears their session.
 * @returns {Promise<Object>} An object containing { success, error }.
 */
export async function logoutUser() {
    try {
        await signOut(auth);
        return { success: true, error: null };
    } catch (error) {
        console.error('[Auth API] Logout Error:', error);
        return { success: false, error: 'Failed to log out. Please try again.' };
    }
}

/**
 * Sends a password reset email to the user.
 * @param {string} email - The email to send the reset link to.
 * @returns {Promise<Object>} An object containing { success, error }.
 */
export async function resetPassword(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true, error: null };
    } catch (error) {
        console.error('[Auth API] Password Reset Error:', error);
        return { success: false, error: getAuthErrorMessage(error.code) };
    }
}

/**
 * Initializes a global listener for Auth state changes.
 * This is crucial for routing users (e.g., kicking them to the login screen if logged out,
 * or taking them straight to the dashboard if a valid session exists).
 * 
 * @param {Function} onLogin - Callback executed when a user logs in / is authenticated.
 * @param {Function} onLogout - Callback executed when a user logs out / is unauthenticated.
 * @returns {Function} Unsubscribe function to detach the listener.
 */
export function initAuthStateListener(onLogin, onLogout) {
    return onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log(`[Auth API] Session active for: ${user.email} (${user.uid})`);
            if (typeof onLogin === 'function') onLogin(user);
        } else {
            console.log('[Auth API] No active session. User is logged out.');
            if (typeof onLogout === 'function') onLogout();
        }
    });
}

/**
 * Helper function to get the current authenticated user synchronously.
 * NOTE: This might return null if called before the auth state is fully initialized by Firebase.
 * @returns {Object|null} The current Firebase Auth user object, or null.
 */
export function getCurrentUser() {
    return auth.currentUser;
}