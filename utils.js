/* ==========================================================================
   ULTIMATE TEAM - FOOTBALL MANAGER & TRADING SIMULATOR
   FILE: firebase.js
   DESCRIPTION: Firebase Initialization Module. Configures Firebase App,
   Authentication, and Realtime Database instances using compat SDK.
   ========================================================================== */

// Firebase Project Configuration
// Replace placeholders with your Firebase Console Project credentials if hosting externally
const firebaseConfig = {
    apiKey: "AIzaSyYOUR_API_KEY_HERE",
    authDomain: "ultimate-team-game.firebaseapp.com",
    databaseURL: "https://ultimate-team-game-default-rtdb.firebaseio.com",
    projectId: "ultimate-team-game",
    storageBucket: "ultimate-team-game.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

// Initialize Firebase App
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

// Global Core Service Instances
const auth = firebase.auth();
const db = firebase.database();

// Configure Auth Persistence (Session persists across browser reloads)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error("Firebase Auth Persistence Error:", error.message);
    });

// Expose Firebase services to global window context for modular scripts
window.firebaseConfig = firebaseConfig;
window.auth = auth;
window.db = db;
