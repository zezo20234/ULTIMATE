/* ==========================================================================
   FIREBASE INITIALIZATION & EXPORTS
   ========================================================================== */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

/**
 * FIREBASE CONFIGURATION
 * 
 * IMPORTANT: Replace this entire object with the configuration from your 
 * actual Firebase Console > Project Settings > General > Your apps.
 * Make sure the Realtime Database is created and its URL is included.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDTv6LbsHY0OFbg5nNTm4z01DTzBDIvlZo",
  authDomain: "ultimate-team-bea58.firebaseapp.com",
  databaseURL: "https://ultimate-team-bea58-default-rtdb.firebaseio.com",
  projectId: "ultimate-team-bea58",
  storageBucket: "ultimate-team-bea58.firebasestorage.app",
  messagingSenderId: "476440211903",
  appId: "1:476440211903:web:817d56e14ff8bec191b10a",
  measurementId: "G-K3P8CBM9FX"
};

// 1. Initialize the Firebase Application
const app = initializeApp(firebaseConfig);

// 2. Initialize Firebase Authentication
const auth = getAuth(app);

// 3. Set Auth Persistence
// Ensures the user stays logged in across page reloads and browser sessions,
// which is crucial for a smooth gaming experience.
setPersistence(auth, browserLocalPersistence)
    .catch((error) => {
        console.error("[Firebase Auth] Error setting persistence:", error.message);
    });

// 4. Initialize Firebase Realtime Database
const db = getDatabase(app);

// 5. Export initialized instances to be used by the rest of the application
export { app, auth, db };