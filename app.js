/* ==========================================================================
   MASTER APPLICATION CONTROLLER
   Handles global navigation, UI screen transitions, auth listeners,
   and application state bootstrapping.
   ========================================================================== */

import { initAuthStateListener, logoutUser, loginUser, registerUser } from './auth.js';
import { getUserProfile, listenToUserCoins, getStorePacks, initializePackStore, setUserOnline, setUserOffline } from './database.js';
import { loadPlayerDatabase, renderPlayerCard, searchPlayers } from './players.js';
import { buyAndOpenPack, playPackAnimation } from './packs.js';
import { searchMarket, buyNow } from './market.js';
import { formatCoins, getRankFromPoints, getRankClass, getPointsForRank } from './utils.js';
import { seedDatabase, startAIMarketActivity, startMaintenanceTasks } from './seedingService.js';
import { initializeMatch, cleanupMatch } from './match.js';
import { startMatchmaking, cancelMatchmaking, checkExistingQueue } from './matchmaking.js';
import { quickSellPlayer, listPlayerOnMarket } from './database.js';

// Global App State
let currentUser = null;
let userProfile = null;
let coinListenerUnsub = null;
let dataRefreshInterval = null;

// DOM Element References Cache
const screens = {
    auth: document.getElementById('auth-screen'),
    dashboard: document.getElementById('dashboard-screen'),
    store: document.getElementById('store-screen'),
    market: document.getElementById('market-screen'),
    club: document.getElementById('club-screen'),
    squad: document.getElementById('squad-screen'),
    matchmaking: document.getElementById('matchmaking-screen'),
    match: document.getElementById('match-screen'),
    admin: document.getElementById('admin-screen')
};

const appHeader = document.getElementById('app-header');
const navBtns = document.querySelectorAll('.nav-btn');
const coinDisplays = document.querySelectorAll('.user-coin-balance');
const clubNameDisplays = document.querySelectorAll('.user-club-name');

/* ==========================================================================
   APPLICATION BOOTSTRAP
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App Controller] Initializing Ultimate Team Application...');
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./service-worker.js');
            console.log('[App Controller] Service Worker registered');
        } catch (error) {
            console.log('[App Controller] Service Worker registration failed:', error);
        }
    }
    
    // 1. Preload the master player database from Firebase or local cache
    const loaded = await loadPlayerDatabase();
    if (!loaded) {
        showToast('Warning: Failed to load master player database. Some features may break.', 'error');
    }

    // 2. Initialize pack store if needed
    await initializePackStore();

    // 3. Seed database with initial data
    await seedDatabase();

    // 4. Start AI market activity
    startAIMarketActivity();

    // 5. Start maintenance tasks
    startMaintenanceTasks();

    // 6. Initialize Auth State Listener
    initAuthStateListener(
        async (user) => {
            // ON LOGIN
            currentUser = user;
            window.currentUser = user; // Make available globally for match system
            window.userProfile = null; // Reset profile
            console.log(`[App Controller] Authenticated as: ${user.uid}`);
            
            // Show header nav
            if (appHeader) appHeader.classList.remove('hidden');

            // Fetch profile data
            userProfile = await getUserProfile(user.uid);
            window.userProfile = userProfile; // Make available globally for match system
            
            // Give starter pack if not received yet
            if (userProfile && !userProfile.hasReceivedStarterPack) {
                const { giveStarterPack } = await import('./database.js');
                await giveStarterPack(user.uid);
                // Reload profile after giving pack
                userProfile = await getUserProfile(user.uid);
                window.userProfile = userProfile;
            }
            
            // Setup real-time listeners for coins
            if (coinListenerUnsub) coinListenerUnsub();
            coinListenerUnsub = listenToUserCoins(user.uid, (newCoins) => {
                if (userProfile && userProfile.economy) {
                    userProfile.economy.coins = newCoins;
                }
                updateCoinUI(newCoins);
            });

            updateHeaderUI();
            switchScreen('dashboard');
            
            // Start periodic data refresh
            startDataRefresh();
        },
        () => {
            // ON LOGOUT
            currentUser = null;
            userProfile = null;
            if (coinListenerUnsub) coinListenerUnsub();
            
            // Stop data refresh
            stopDataRefresh();
            
            // Hide header nav
            if (appHeader) appHeader.classList.add('hidden');
            
            switchScreen('auth');
        }
    );

    // 7. Bind Global UI Events & Listeners
    bindAuthForms();
    bindNavigationEvents();
    bindGlobalEvents();
    
    // 8. Check for existing matchmaking queue
    checkExistingQueue();
    
    // 9. Simulate loading progress
    simulateLoadingProgress();
    
    // 10. Hide initial loader after loading completes
    setTimeout(() => {
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 500);
        }
    }, 3000);
});

// Handle window close/tab close - set user offline
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        try {
            await setUserOffline(currentUser.uid);
        } catch (error) {
            console.error('[App Controller] Error setting user offline on close:', error);
        }
    }
});

// Handle visibility change - manage online status
document.addEventListener('visibilitychange', async () => {
    if (currentUser) {
        if (document.hidden) {
            // Page hidden - user might be inactive
            console.log('[App Controller] Page hidden, user inactive');
        } else {
            // Page visible again - ensure user is online
            try {
                await setUserOnline(currentUser.uid);
                console.log('[App Controller] Page visible, user online');
            } catch (error) {
                console.error('[App Controller] Error setting user online on visibility change:', error);
            }
        }
    }
});

/**
 * Simulate loading progress with status updates
 */
function simulateLoadingProgress() {
    const loadingBar = document.getElementById('loading-bar');
    const loadingStatus = document.getElementById('loading-status');
    const loadingPercent = document.getElementById('loading-percent');
    
    const steps = [
        { progress: 20, status: 'Loading player database...' },
        { progress: 40, status: 'Initializing market...' },
        { progress: 60, status: 'Setting up AI traders...' },
        { progress: 80, status: 'Loading squad data...' },
        { progress: 100, status: 'Ready!' }
    ];
    
    let currentStep = 0;
    
    const updateProgress = () => {
        if (currentStep < steps.length) {
            const step = steps[currentStep];
            if (loadingBar) loadingBar.style.width = step.progress + '%';
            if (loadingStatus) loadingStatus.textContent = step.status;
            if (loadingPercent) loadingPercent.textContent = step.progress + '%';
            currentStep++;
            setTimeout(updateProgress, 500);
        }
    };
    
    updateProgress();
}

/**
 * Refresh all data from Firebase
 */
async function refreshAllData() {
    if (!currentUser) return;
    
    try {
        console.log('[App Controller] Refreshing data from Firebase...');
        
        // Reload user profile
        const { getUserProfile } = await import('./database.js');
        userProfile = await getUserProfile(currentUser.uid);
        window.userProfile = userProfile;
        
        // Update header UI
        updateHeaderUI();
        
        // Update rank display if on matchmaking screen
        if (document.getElementById('matchmaking-screen').classList.contains('hidden') === false) {
            updateRankDisplay();
        }
        
        // Refresh current screen data
        const currentScreen = document.querySelector('.app-screen:not(.hidden)');
        if (currentScreen) {
            const screenId = currentScreen.id;
            
            if (screenId === 'store-screen') {
                await initStoreScreen();
            } else if (screenId === 'market-screen') {
                await handleMarketSearch();
            } else if (screenId === 'club-screen') {
                await renderClub();
            } else if (screenId === 'squad-screen') {
                await loadSquadFromFirebase();
            } else if (screenId === 'admin-screen') {
                await loadAdminPlayers();
            } else if (screenId === 'matchmaking-screen') {
                // Refresh matchmaking data
                updateRankDisplay();
                checkExistingQueue();
            } else if (screenId === 'match-screen') {
                // Refresh match data - reload profile but don't interrupt match
                console.log('[App Controller] Refreshing during match - profile updated only');
            }
        }
        
        console.log('[App Controller] Data refresh complete');
    } catch (error) {
        console.error('[App Controller] Error refreshing data:', error);
    }
}

/**
 * Start periodic data refresh (every 2 minutes)
 */
function startDataRefresh() {
    // Clear existing interval if any
    if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
    }
    
    // Refresh every 2 minutes (120,000ms)
    dataRefreshInterval = setInterval(() => {
        refreshAllData();
    }, 120000);
    
    console.log('[App Controller] Data refresh interval started (2 minutes)');
}

/**
 * Stop data refresh
 */
function stopDataRefresh() {
    if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
        dataRefreshInterval = null;
        console.log('[App Controller] Data refresh interval stopped');
    }
}

/* ==========================================================================
   SCREEN ROUTER & NAVIGATION
   ========================================================================== */

function switchScreen(screenName) {
    // Toggle Screen Visibility
    Object.keys(screens).forEach(key => {
        const screen = screens[key];
        if (screen) {
            if (key === screenName) {
                screen.classList.remove('hidden');
            } else {
                screen.classList.add('hidden');
            }
        }
    });

    // Update Navigation Button Active States
    navBtns.forEach(btn => {
        if (btn.getAttribute('data-target-screen') === screenName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Trigger screen-specific initializers
    if (screenName === 'store') initStoreScreen();
    if (screenName === 'market') initMarketScreen();
    if (screenName === 'club') initClubScreen();
    if (screenName === 'squad') initSquadBuilder();
    if (screenName === 'matchmaking') initMatchmakingScreen();
    if (screenName === 'match') initMatchScreen();
    if (screenName === 'admin') initAdminScreen();
    
    // Cleanup when leaving match screen
    if (screenName !== 'match') {
        cleanupMatch();
    }
    
    // Cancel matchmaking when leaving matchmaking screen
    if (screenName !== 'matchmaking') {
        cancelMatchmaking();
    }
}

function bindNavigationEvents() {
    document.querySelectorAll('[data-target-screen]').forEach(element => {
        element.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target-screen');
            if (target && screens[target]) {
                switchScreen(target);
            }
        });
    });

    // Logout triggers
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await logoutUser();
        });
    });
}

function updateCoinUI(coins) {
    coinDisplays.forEach(el => {
        el.innerText = formatCoins(coins);
    });
}

function updateHeaderUI() {
    if (!userProfile) return;
    const clubName = userProfile.profile?.clubName || 'My Club';
    clubNameDisplays.forEach(el => {
        el.innerText = clubName;
    });
    const coins = userProfile.economy?.coins || 0;
    updateCoinUI(coins);
}

/* ==========================================================================
   AUTHENTICATION UI BINDINGS
   ========================================================================== */

function bindAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');

    if (toggleAuthModeBtn && loginForm && registerForm) {
        // Clone and replace to kill any ghost event listeners from hot-reloading
        const newToggleBtn = toggleAuthModeBtn.cloneNode(true);
        toggleAuthModeBtn.parentNode.replaceChild(newToggleBtn, toggleAuthModeBtn);
        
        newToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const isLoginVisible = !loginForm.classList.contains('hidden');
            
            if (isLoginVisible) {
                // Switch to Register form
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
                newToggleBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Return to Login';
            } else {
                // Switch back to Login form
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
                newToggleBtn.innerHTML = 'Create New Club Instead';
            }
        });
    }

    // Login Form Submit Logic
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-password').value;
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
            submitBtn.disabled = true;

            const res = await loginUser(email, pass);
            
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            
            if (!res.success) showToast(res.error, 'error');
        });
    }

    // Register Form Submit Logic
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const club = document.getElementById('reg-clubname').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const pass = document.getElementById('reg-password').value;

            const submitBtn = registerForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Club...';
            submitBtn.disabled = true;

            const res = await registerUser(email, pass, club);
            
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            
            if (!res.success) showToast(res.error, 'error');
        });
    }
}

/* ==========================================================================
   GLOBAL EVENT BINDINGS
   ========================================================================== */

function bindGlobalEvents() {
    // Dashboard promo cards
    document.querySelectorAll('.dash-card').forEach(card => {
        card.addEventListener('click', () => {
            const target = card.getAttribute('data-target-screen');
            if (target) switchScreen(target);
        });
    });
}

/* ==========================================================================
   STORE SCREEN INITIALIZATION
   ========================================================================== */

async function initStoreScreen() {
    const storeGrid = document.getElementById('store-grid');
    if (!storeGrid) return;

    try {
        const packs = await getStorePacks();
        storeGrid.innerHTML = '';

        Object.values(packs).forEach(pack => {
            const packCard = createPackCard(pack);
            storeGrid.appendChild(packCard);
        });
    } catch (error) {
        console.error('[Store Screen] Error loading packs:', error);
        storeGrid.innerHTML = '<div class="text-muted">Failed to load packs. Please try again.</div>';
    }
}

function createPackCard(pack) {
    const card = document.createElement('div');
    card.className = 'pack-card';
    if (pack.id.includes('promo') || pack.id.includes('ultimate')) {
        card.classList.add('featured');
    }

    card.innerHTML = `
        <div class="pack-art">
            <i class="fa-solid fa-box-open"></i>
        </div>
        <div class="pack-info">
            <h3>${pack.name}</h3>
            <div class="pack-odds">${pack.description || `${pack.items} players`}</div>
            <div class="pack-price">
                <i class="fa-solid fa-coins"></i> ${formatCoins(pack.cost)}
            </div>
        </div>
        <button class="btn btn-primary w-100 open-pack-btn" data-pack-id="${pack.id}">
            Open Pack
        </button>
    `;

    // Bind open pack button
    const openBtn = card.querySelector('.open-pack-btn');
    openBtn.addEventListener('click', () => handlePackOpen(pack));

    return card;
}

async function handlePackOpen(pack) {
    if (!currentUser || !userProfile) {
        showToast('You must be logged in to open packs.', 'error');
        return;
    }

    const coins = userProfile.economy?.coins || 0;
    if (coins < pack.cost) {
        showToast('Insufficient coins to open this pack.', 'error');
        return;
    }

    try {
        const result = await buyAndOpenPack(currentUser.uid, pack);
        
        if (result.success) {
            // Reload user profile to get updated club
            const { getUserProfile } = await import('./database.js');
            userProfile = await getUserProfile(currentUser.uid);
            window.userProfile = userProfile;
            
            // Show pack opening animation
            const overlay = document.getElementById('pack-opening-overlay');
            overlay.classList.remove('hidden');
            
            await playPackAnimation(overlay, result.items, renderPlayerCard);
            
            // Clean up overlay after animation
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.innerHTML = '';
            }, 5000);
            
            showToast(`Opened ${pack.name}! Got ${result.items.length} players.`, 'success');
            
            // Refresh club screen if currently viewing it
            const clubScreen = document.getElementById('club-screen');
            if (!clubScreen.classList.contains('hidden')) {
                await renderClub();
            }
        } else {
            showToast(result.error || 'Failed to open pack.', 'error');
        }
    } catch (error) {
        console.error('[Store Screen] Error opening pack:', error);
        showToast('An error occurred while opening the pack.', 'error');
    }
}

/* ==========================================================================
   MARKET SCREEN INITIALIZATION
   ========================================================================== */

async function initMarketScreen() {
    // Bind market tabs
    const tabs = document.querySelectorAll('.market-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all tab contents
            document.querySelectorAll('.market-tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            
            // Show selected tab content
            const tabName = tab.dataset.tab;
            document.getElementById(`tab-${tabName}`).classList.remove('hidden');
            
            // Load content for selected tab
            if (tabName === 'search') {
                handleMarketSearch();
            } else if (tabName === 'my-listings') {
                loadMyListings();
            }
        });
    });

    // Bind search button
    const searchBtn = document.getElementById('market-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', handleMarketSearch);
    }

    // Load initial market listings
    await handleMarketSearch();
}

async function handleMarketSearch() {
    const marketGrid = document.getElementById('market-grid');
    if (!marketGrid) return;

    const searchName = document.getElementById('market-search')?.value || '';
    const position = document.getElementById('market-position')?.value || 'ALL';
    const rarity = document.getElementById('market-rarity')?.value || 'ALL';
    const minRating = parseInt(document.getElementById('market-min-rating')?.value) || 0;
    const maxPrice = parseInt(document.getElementById('market-max-price')?.value) || 0;

    marketGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><div class="loading-spinner" style="margin: 0 auto;"></div><p class="loading-text">Searching market...</p></div>';

    try {
        const results = await searchMarket({
            name: searchName,
            position: position,
            rarity: rarity,
            minRating: minRating,
            maxPrice: maxPrice
        });

        marketGrid.innerHTML = '';

        if (results.results.length === 0) {
            marketGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">No listings found matching your criteria.</p></div>';
            return;
        }

        results.results.forEach(listing => {
            const listingCard = createMarketListing(listing);
            marketGrid.appendChild(listingCard);
        });
    } catch (error) {
        console.error('[Market Screen] Error searching market:', error);
        marketGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">Failed to search market. Please try again.</p></div>';
    }
}

function createMarketListing(listing) {
    const card = document.createElement('div');
    card.className = 'market-listing';

    const playerCard = renderPlayerCard(listing.player, { showPrice: false });
    const timeRemaining = Math.max(0, Math.floor((listing.expiresAt - Date.now()) / 1000 / 60)); // minutes

    card.innerHTML = `
        <div class="listing-info">
            <span class="listing-seller">${listing.sellerType === 'ai' ? 'AI Club' : 'User'}</span>
            <span class="listing-time">${timeRemaining}m</span>
        </div>
    `;

    card.appendChild(playerCard);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'market-item-prices';
    priceDiv.innerHTML = `
        <div><span>Buy Now:</span> <strong><i class="fa-solid fa-coins"></i> ${formatCoins(listing.buyNowPrice)}</strong></div>
    `;
    card.appendChild(priceDiv);

    // Add buy button
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn btn-primary w-100 mt-2';
    buyBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Buy Now';
    buyBtn.addEventListener('click', () => handleBuyNow(listing.id));
    card.appendChild(buyBtn);

    return card;
}

async function handleBuyNow(listingId) {
    if (!currentUser) {
        showToast('You must be logged in to buy players.', 'error');
        return;
    }

    try {
        const result = await buyNow(currentUser.uid, listingId);
        
        if (result.success) {
            showToast('Player purchased successfully!', 'success');
            
            // Reload user profile to get updated club
            const { getUserProfile } = await import('./database.js');
            userProfile = await getUserProfile(currentUser.uid);
            window.userProfile = userProfile;
            
            // Refresh market
            await handleMarketSearch();
            
            // Refresh club screen if currently viewing it
            const clubScreen = document.getElementById('club-screen');
            if (!clubScreen.classList.contains('hidden')) {
                await renderClub();
            }
        } else {
            showToast(result.error || 'Failed to purchase player.', 'error');
        }
    } catch (error) {
        console.error('[Market Screen] Error buying player:', error);
        showToast('An error occurred while purchasing.', 'error');
    }
}

async function loadMyListings() {
    if (!currentUser) {
        showToast('You must be logged in to view your listings.', 'error');
        return;
    }

    const myListingsGrid = document.getElementById('my-listings-grid');
    if (!myListingsGrid) return;

    myListingsGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><div class="loading-spinner" style="margin: 0 auto;"></div><p class="loading-text">Loading your listings...</p></div>';

    try {
        const { readData } = await import('./database.js');
        const marketData = await readData('market');
        
        if (!marketData) {
            myListingsGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">No listings found.</p></div>';
            return;
        }

        const myListings = Object.values(marketData).filter(
            listing => listing.sellerId === currentUser.uid && listing.status === 'active'
        );

        myListingsGrid.innerHTML = '';

        if (myListings.length === 0) {
            myListingsGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">You have no active listings.</p></div>';
            return;
        }

        myListings.forEach(listing => {
            const listingCard = createMyListingCard(listing);
            myListingsGrid.appendChild(listingCard);
        });
    } catch (error) {
        console.error('[Market Screen] Error loading my listings:', error);
        myListingsGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">Failed to load listings.</p></div>';
    }
}

function createMyListingCard(listing) {
    const card = document.createElement('div');
    card.className = 'market-listing';

    const playerCard = renderPlayerCard(listing.player, { showPrice: false });
    const timeRemaining = Math.max(0, Math.floor((listing.expiresAt - Date.now()) / 1000 / 60)); // minutes

    card.innerHTML = `
        <div class="listing-info">
            <span class="listing-status">Active</span>
            <span class="listing-time">${timeRemaining}m remaining</span>
        </div>
    `;

    card.appendChild(playerCard);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'market-item-prices';
    priceDiv.innerHTML = `
        <div><span>Start Price:</span> <strong><i class="fa-solid fa-coins"></i> ${formatCoins(listing.startPrice)}</strong></div>
        <div><span>Buy Now:</span> <strong><i class="fa-solid fa-coins"></i> ${formatCoins(listing.buyNowPrice)}</strong></div>
    `;
    card.appendChild(priceDiv);

    // Add cancel listing button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary w-100 mt-2';
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel Listing';
    cancelBtn.addEventListener('click', () => handleCancelListing(listing.id));
    card.appendChild(cancelBtn);

    return card;
}

async function handleCancelListing(listingId) {
    if (!currentUser) {
        showToast('You must be logged in to cancel listings.', 'error');
        return;
    }

    try {
        const { updateMultipath, readData } = await import('./database.js');
        
        // Get listing data
        const marketData = await readData('market');
        const listing = marketData[listingId];
        
        if (!listing || listing.sellerId !== currentUser.uid) {
            showToast('You can only cancel your own listings.', 'error');
            return;
        }

        // Return player to club
        const updates = {};
        updates[`users/${currentUser.uid}/club/${listing.player.instanceId}`] = listing.player;
        updates[`market/${listingId}/status`] = 'cancelled';
        updates[`market/${listingId}/cancelledAt`] = Date.now();

        await updateMultipath(updates);
        
        // Reload user profile to get updated club
        const { getUserProfile } = await import('./database.js');
        userProfile = await getUserProfile(currentUser.uid);
        window.userProfile = userProfile;
        
        showToast('Listing cancelled and player returned to club.', 'success');
        
        // Reload my listings
        await loadMyListings();
        
        // Refresh club screen if currently viewing it
        const clubScreen = document.getElementById('club-screen');
        if (!clubScreen.classList.contains('hidden')) {
            await renderClub();
        }
    } catch (error) {
        console.error('[Market Screen] Error cancelling listing:', error);
        showToast('Failed to cancel listing.', 'error');
    }
}

/* ==========================================================================
   CLUB SCREEN INITIALIZATION
   ========================================================================== */

async function initClubScreen() {
    const clubGrid = document.getElementById('club-grid');
    if (!clubGrid) return;

    // Bind filter and sort controls
    const filterSelect = document.getElementById('club-filter');
    const sortSelect = document.getElementById('club-sort');

    if (filterSelect) {
        filterSelect.addEventListener('change', renderClub);
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', renderClub);
    }

    await renderClub();
}

async function renderClub() {
    const clubGrid = document.getElementById('club-grid');
    if (!clubGrid) return;

    // Reload user profile to get latest club data
    if (currentUser) {
        const { getUserProfile } = await import('./database.js');
        userProfile = await getUserProfile(currentUser.uid);
        window.userProfile = userProfile;
    }

    if (!userProfile) return;

    const filter = document.getElementById('club-filter')?.value || 'ALL';
    const sort = document.getElementById('club-sort')?.value || 'rating-desc';

    clubGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><div class="loading-spinner" style="margin: 0 auto;"></div><p class="loading-text">Loading club...</p></div>';

    try {
        const club = userProfile.club || {};
        const players = Object.values(club);

        // Apply filters
        let filtered = players;
        if (filter !== 'ALL') {
            filtered = players.filter(p => p.rarity === filter);
        }

        // Apply sorting
        const [sortBy, order] = sort.split('-');
        filtered = filtered.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'rating') comparison = b.rating - a.rating;
            else if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
            
            return order === 'asc' ? -comparison : comparison;
        });

        // Update stats
        document.getElementById('club-total-players').textContent = players.length;
        const squadRating = calculateSquadRating(filtered);
        document.getElementById('club-squad-rating').textContent = squadRating;

        clubGrid.innerHTML = '';

        if (filtered.length === 0) {
            clubGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">No players in your club match the current filter.</p></div>';
            return;
        }

        filtered.forEach(player => {
            const card = renderPlayerCard(player, { 
                showPrice: false,
                onClick: (p) => showPlayerActions(p)
            });
            clubGrid.appendChild(card);
        });
    } catch (error) {
        console.error('[Club Screen] Error loading club:', error);
        clubGrid.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 4rem;"><p class="text-muted">Failed to load club. Please try again.</p></div>';
    }
}

function calculateSquadRating(players) {
    if (!players || players.length === 0) return 0;
    const totalRating = players.reduce((sum, p) => sum + (p.rating || 0), 0);
    return Math.round(totalRating / players.length);
}

function showPlayerActions(player) {
    // Create a simple modal for player actions
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">${player.name}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                    ${renderPlayerCard(player, { showPrice: false }).outerHTML}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <button class="btn btn-secondary quick-sell-btn">Quick Sell (${formatCoins(player.quickSellValue)})</button>
                    <button class="btn btn-secondary list-market-btn">List on Market</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Quick sell button
    modal.querySelector('.quick-sell-btn').addEventListener('click', async () => {
        if (!currentUser) {
            showToast('You must be logged in to quick sell.', 'error');
            return;
        }

        const success = await quickSellPlayer(currentUser.uid, player.instanceId, player.quickSellValue);
        if (success) {
            showToast(`Quick sold ${player.name} for ${formatCoins(player.quickSellValue)}!`, 'success');
            
            // Reload user profile to get updated club
            const { getUserProfile } = await import('./database.js');
            userProfile = await getUserProfile(currentUser.uid);
            window.userProfile = userProfile;
            
            // Reload club
            modal.remove();
            await renderClub();
        } else {
            showToast('Failed to quick sell player.', 'error');
        }
    });

    // List on market button
    modal.querySelector('.list-market-btn').addEventListener('click', async () => {
        if (!currentUser) {
            showToast('You must be logged in to list on market.', 'error');
            return;
        }

        // Show listing price modal
        const listingModal = document.createElement('div');
        listingModal.className = 'modal-overlay';
        listingModal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">List ${player.name} on Market</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem;">Start Price:</label>
                        <input type="number" id="start-price" class="search-input w-100" value="${Math.floor(player.quickSellValue * 1.5)}" min="0">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem;">Buy Now Price:</label>
                        <input type="number" id="buy-now-price" class="search-input w-100" value="${Math.floor(player.quickSellValue * 2)}" min="0">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem;">Duration (hours):</label>
                        <select id="listing-duration" class="search-input w-100">
                            <option value="1">1 Hour</option>
                            <option value="6">6 Hours</option>
                            <option value="12">12 Hours</option>
                            <option value="24" selected>24 Hours</option>
                            <option value="48">48 Hours</option>
                        </select>
                    </div>
                    <button class="btn btn-primary w-100" id="confirm-list-btn">List Player</button>
                </div>
            </div>
        `;

        document.body.appendChild(listingModal);

        listingModal.querySelector('.modal-close').addEventListener('click', () => listingModal.remove());
        listingModal.addEventListener('click', (e) => {
            if (e.target === listingModal) listingModal.remove();
        });

        listingModal.querySelector('#confirm-list-btn').addEventListener('click', async () => {
            const startPrice = parseInt(listingModal.querySelector('#start-price').value);
            const buyNowPrice = parseInt(listingModal.querySelector('#buy-now-price').value);
            const duration = parseInt(listingModal.querySelector('#listing-duration').value);

            if (startPrice < 0 || buyNowPrice < 0 || startPrice >= buyNowPrice) {
                showToast('Invalid prices. Start price must be less than buy now price.', 'error');
                return;
            }

            try {
                await listPlayerOnMarket(currentUser.uid, player, startPrice, buyNowPrice, duration, 'user');
                showToast(`${player.name} listed on market!`, 'success');
                
                // Reload user profile to get updated club
                const { getUserProfile } = await import('./database.js');
                userProfile = await getUserProfile(currentUser.uid);
                window.userProfile = userProfile;
                
                // Reload club
                await renderClub();
                listingModal.remove();
                modal.remove();
            } catch (error) {
                console.error('Error listing player:', error);
                showToast('Failed to list player on market.', 'error');
            }
        });
    });
}

/* ==========================================================================
   SQUAD BUILDER SYSTEM
   ========================================================================== */

// Formation definitions with exactly 11 positions each (with unique keys)
const FORMATIONS = {
    '4-3-3': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'CM', x: 35, y: 50, key: 'CM-1' },
        { position: 'CM', x: 50, y: 52, key: 'CM-2' },
        { position: 'CM', x: 65, y: 50, key: 'CM-3' },
        { position: 'LW', x: 20, y: 20, key: 'LW' },
        { position: 'ST', x: 50, y: 15, key: 'ST' },
        { position: 'RW', x: 80, y: 20, key: 'RW' }
    ],
    '4-4-2': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'LM', x: 20, y: 45, key: 'LM' },
        { position: 'CM', x: 40, y: 50, key: 'CM-1' },
        { position: 'CM', x: 60, y: 50, key: 'CM-2' },
        { position: 'RM', x: 80, y: 45, key: 'RM' },
        { position: 'ST', x: 35, y: 20, key: 'ST-1' },
        { position: 'ST', x: 65, y: 20, key: 'ST-2' }
    ],
    '3-5-2': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'CB', x: 30, y: 75, key: 'CB-1' },
        { position: 'CB', x: 50, y: 78, key: 'CB-2' },
        { position: 'CB', x: 70, y: 75, key: 'CB-3' },
        { position: 'LM', x: 15, y: 50, key: 'LM' },
        { position: 'CDM', x: 35, y: 55, key: 'CDM-1' },
        { position: 'CDM', x: 50, y: 58, key: 'CDM-2' },
        { position: 'CDM', x: 65, y: 55, key: 'CDM-3' },
        { position: 'RM', x: 85, y: 50, key: 'RM' },
        { position: 'ST', x: 35, y: 20, key: 'ST-1' },
        { position: 'ST', x: 65, y: 20, key: 'ST-2' }
    ],
    '4-2-3-1': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'CDM', x: 35, y: 55, key: 'CDM-1' },
        { position: 'CDM', x: 65, y: 55, key: 'CDM-2' },
        { position: 'LW', x: 20, y: 30, key: 'LW' },
        { position: 'CAM', x: 40, y: 35, key: 'CAM-1' },
        { position: 'CAM', x: 60, y: 35, key: 'CAM-2' },
        { position: 'RW', x: 80, y: 30, key: 'RW' },
        { position: 'ST', x: 50, y: 15, key: 'ST' }
    ],
    '5-3-2': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LWB', x: 15, y: 70, key: 'LWB' },
        { position: 'CB', x: 30, y: 75, key: 'CB-1' },
        { position: 'CB', x: 50, y: 78, key: 'CB-2' },
        { position: 'CB', x: 70, y: 75, key: 'CB-3' },
        { position: 'RWB', x: 85, y: 70, key: 'RWB' },
        { position: 'CM', x: 30, y: 50, key: 'CM-1' },
        { position: 'CM', x: 50, y: 55, key: 'CM-2' },
        { position: 'CM', x: 70, y: 50, key: 'CM-3' },
        { position: 'ST', x: 35, y: 20, key: 'ST-1' },
        { position: 'ST', x: 65, y: 20, key: 'ST-2' }
    ],
    '4-1-4-1': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'CDM', x: 50, y: 60, key: 'CDM' },
        { position: 'LM', x: 20, y: 40, key: 'LM' },
        { position: 'CM', x: 40, y: 45, key: 'CM-1' },
        { position: 'CM', x: 60, y: 45, key: 'CM-2' },
        { position: 'RM', x: 80, y: 40, key: 'RM' },
        { position: 'ST', x: 50, y: 15, key: 'ST' }
    ],
    '3-4-3': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'CB', x: 30, y: 75, key: 'CB-1' },
        { position: 'CB', x: 50, y: 78, key: 'CB-2' },
        { position: 'CB', x: 70, y: 75, key: 'CB-3' },
        { position: 'LM', x: 20, y: 50, key: 'LM' },
        { position: 'CM', x: 40, y: 55, key: 'CM-1' },
        { position: 'CM', x: 60, y: 55, key: 'CM-2' },
        { position: 'RM', x: 80, y: 50, key: 'RM' },
        { position: 'LW', x: 20, y: 20, key: 'LW' },
        { position: 'ST', x: 50, y: 15, key: 'ST' },
        { position: 'RW', x: 80, y: 20, key: 'RW' }
    ],
    '4-3-2-1': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'LM', x: 20, y: 45, key: 'LM' },
        { position: 'CM', x: 40, y: 50, key: 'CM-1' },
        { position: 'CM', x: 60, y: 50, key: 'CM-2' },
        { position: 'RM', x: 80, y: 45, key: 'RM' },
        { position: 'CAM', x: 40, y: 30, key: 'CAM-1' },
        { position: 'CAM', x: 60, y: 30, key: 'CAM-2' },
        { position: 'ST', x: 50, y: 15, key: 'ST' }
    ],
    '5-2-3': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LWB', x: 15, y: 70, key: 'LWB' },
        { position: 'CB', x: 30, y: 75, key: 'CB-1' },
        { position: 'CB', x: 50, y: 78, key: 'CB-2' },
        { position: 'CB', x: 70, y: 75, key: 'CB-3' },
        { position: 'RWB', x: 85, y: 70, key: 'RWB' },
        { position: 'CDM', x: 35, y: 55, key: 'CDM-1' },
        { position: 'CDM', x: 65, y: 55, key: 'CDM-2' },
        { position: 'LW', x: 20, y: 20, key: 'LW' },
        { position: 'ST', x: 50, y: 15, key: 'ST' },
        { position: 'RW', x: 80, y: 20, key: 'RW' }
    ],
    '4-5-1': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'LM', x: 15, y: 45, key: 'LM' },
        { position: 'CDM', x: 35, y: 50, key: 'CDM-1' },
        { position: 'CM', x: 50, y: 55, key: 'CM' },
        { position: 'CDM', x: 65, y: 50, key: 'CDM-2' },
        { position: 'RM', x: 85, y: 45, key: 'RM' },
        { position: 'ST', x: 50, y: 15, key: 'ST' }
    ],
    '3-4-2-1': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'CB', x: 30, y: 75, key: 'CB-1' },
        { position: 'CB', x: 50, y: 78, key: 'CB-2' },
        { position: 'CB', x: 70, y: 75, key: 'CB-3' },
        { position: 'LM', x: 20, y: 50, key: 'LM' },
        { position: 'CM', x: 40, y: 55, key: 'CM-1' },
        { position: 'CM', x: 60, y: 55, key: 'CM-2' },
        { position: 'RM', x: 80, y: 50, key: 'RM' },
        { position: 'CAM', x: 40, y: 30, key: 'CAM-1' },
        { position: 'CAM', x: 60, y: 30, key: 'CAM-2' },
        { position: 'ST', x: 50, y: 15, key: 'ST' }
    ],
    '4-4-1-1': [
        { position: 'GK', x: 50, y: 90, key: 'GK' },
        { position: 'LB', x: 20, y: 70, key: 'LB' },
        { position: 'CB', x: 35, y: 75, key: 'CB-1' },
        { position: 'CB', x: 65, y: 75, key: 'CB-2' },
        { position: 'RB', x: 80, y: 70, key: 'RB' },
        { position: 'LM', x: 20, y: 45, key: 'LM' },
        { position: 'CM', x: 40, y: 50, key: 'CM-1' },
        { position: 'CM', x: 60, y: 50, key: 'CM-2' },
        { position: 'RM', x: 80, y: 45, key: 'RM' },
        { position: 'CAM', x: 50, y: 30, key: 'CAM' },
        { position: 'ST', x: 50, y: 15, key: 'ST' }
    ]
};

// Current squad state
let currentSquad = {};
let currentFormation = '4-3-3';

// Initialize squad builder
function initSquadBuilder() {
    const formationSelect = document.getElementById('formation-select');
    const autoBuildBtn = document.getElementById('auto-build-btn');
    const clearBtn = document.getElementById('clear-squad-btn');

    // Formation change
    formationSelect.addEventListener('change', (e) => {
        currentFormation = e.target.value;
        renderFormation();
        autoSaveSquad();
    });

    // Auto build
    autoBuildBtn.addEventListener('click', autoBuildSquad);

    // Clear squad
    clearBtn.addEventListener('click', clearSquad);

    // Load existing squad
    loadSquadFromFirebase();

    // Render initial formation
    renderFormation();
}

// Render formation on field
function renderFormation() {
    const positionsContainer = document.getElementById('formation-positions');
    const formation = FORMATIONS[currentFormation];

    positionsContainer.innerHTML = '';

    formation.forEach((pos) => {
        const slot = document.createElement('div');
        slot.className = 'position-slot';
        slot.style.left = `${pos.x}%`;
        slot.style.top = `${pos.y}%`;
        slot.dataset.position = pos.position;
        slot.dataset.key = pos.key;
        slot.dataset.index = formation.indexOf(pos);

        const player = currentSquad[pos.key];

        if (player) {
            slot.classList.add('filled');
            slot.innerHTML = `
                <div class="position-player-card">
                    <div class="player-rating">${player.rating}</div>
                    <div class="player-name">${player.name}</div>
                    <div class="player-position">${player.position}</div>
                </div>
            `;
        } else {
            slot.classList.add('empty');
            slot.innerHTML = `
                <span class="position-label">${pos.position}</span>
                <span class="add-icon"><i class="fa-solid fa-plus"></i></span>
            `;
            slot.addEventListener('click', () => openPlayerSelector(pos.position, pos.key, slot));
        }

        positionsContainer.appendChild(slot);
    });

    updateSquadStats();
}

// Update squad stats
function updateSquadStats() {
    const playerCount = Object.keys(currentSquad).length;
    const totalRating = Object.values(currentSquad).reduce((sum, p) => sum + p.rating, 0);
    const avgRating = playerCount > 0 ? Math.round(totalRating / playerCount) : 0;

    document.getElementById('player-count').textContent = `${playerCount}/11`;
    document.getElementById('squad-rating').textContent = avgRating;
}

// Open player selector modal
function openPlayerSelector(position, key, slot) {
    const modal = document.createElement('div');
    modal.className = 'player-modal';
    modal.innerHTML = `
        <div class="player-modal-content">
            <div class="player-modal-header">
                <h3>Select ${position}</h3>
                <button class="player-modal-close">&times;</button>
            </div>
            <div class="player-modal-body">
                <div class="player-grid" id="player-grid"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close modal
    modal.querySelector('.player-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Load available players
    const playerGrid = modal.querySelector('#player-grid');
    const club = userProfile?.club || {};
    const players = Object.values(club);

    // Filter by position compatibility
    const positionRules = {
        'GK': ['GK'],
        'CB': ['CB'],
        'LB': ['LB', 'LWB'],
        'RB': ['RB', 'RWB'],
        'LWB': ['LWB', 'LB'],
        'RWB': ['RWB', 'RB'],
        'CDM': ['CDM', 'CM'],
        'CM': ['CM', 'CDM', 'CAM'],
        'CAM': ['CAM', 'CM', 'CF'],
        'LM': ['LM', 'LW', 'LAM'],
        'RM': ['RM', 'RW', 'RAM'],
        'LW': ['LW', 'LM', 'LAM'],
        'RW': ['RW', 'RM', 'RAM'],
        'LAM': ['LAM', 'CAM', 'LM'],
        'RAM': ['RAM', 'CAM', 'RM'],
        'ST': ['ST', 'CF'],
        'CF': ['CF', 'ST', 'CAM']
    };

    const validPositions = positionRules[position] || [position];
    const usedPlayerIds = new Set(Object.values(currentSquad).map(p => p.instanceId));

    const availablePlayers = players.filter(p => {
        if (usedPlayerIds.has(p.instanceId)) return false;
        const playerPos = (p.position || '').toUpperCase();
        return validPositions.includes(playerPos);
    });

    // Sort by rating (highest first)
    availablePlayers.sort((a, b) => b.rating - a.rating);

    if (availablePlayers.length === 0) {
        playerGrid.innerHTML = '<p class="text-muted">No suitable players available for this position.</p>';
        return;
    }

    availablePlayers.forEach(player => {
        const card = document.createElement('div');
        card.className = 'modal-player-card';
        card.innerHTML = `
            <div class="rating">${player.rating}</div>
            <div class="name">${player.name}</div>
            <div class="position">${player.position}</div>
        `;
        card.addEventListener('click', () => {
            currentSquad[key] = player;
            renderFormation();
            autoSaveSquad();
            modal.remove();
        });
        playerGrid.appendChild(card);
    });
}

// Auto build squad position by position
async function autoBuildSquad() {
    if (!userProfile?.club) {
        showToast('No players in your club!', 'error');
        return;
    }

    const club = userProfile.club;
    const players = Object.values(club);
    const formation = FORMATIONS[currentFormation];

    // Clear current squad
    currentSquad = {};

    // Build position by position
    for (const pos of formation) {
        const positionRules = {
            'GK': ['GK'],
            'CB': ['CB'],
            'LB': ['LB', 'LWB'],
            'RB': ['RB', 'RWB'],
            'LWB': ['LWB', 'LB'],
            'RWB': ['RWB', 'RB'],
            'CDM': ['CDM', 'CM'],
            'CM': ['CM', 'CDM', 'CAM'],
            'CAM': ['CAM', 'CM', 'CF'],
            'LM': ['LM', 'LW', 'LAM'],
            'RM': ['RM', 'RW', 'RAM'],
            'LW': ['LW', 'LM', 'LAM'],
            'RW': ['RW', 'RM', 'RAM'],
            'LAM': ['LAM', 'CAM', 'LM'],
            'RAM': ['RAM', 'CAM', 'RM'],
            'ST': ['ST', 'CF'],
            'CF': ['CF', 'ST', 'CAM']
        };

        const validPositions = positionRules[pos.position] || [pos.position];
        const usedPlayerIds = new Set(Object.values(currentSquad).map(p => p.instanceId));

        // Find best player for this position
        const validPlayers = players.filter(p => {
            if (usedPlayerIds.has(p.instanceId)) return false;
            const playerPos = (p.position || '').toUpperCase();
            return validPositions.includes(playerPos);
        });

        if (validPlayers.length > 0) {
            // Sort by rating, prefer exact position match
            validPlayers.sort((a, b) => {
                if (b.rating !== a.rating) return b.rating - a.rating;
                const aExact = (a.position || '').toUpperCase() === pos.position;
                const bExact = (b.position || '').toUpperCase() === pos.position;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                return 0;
            });

            currentSquad[pos.key] = validPlayers[0];
        }
    }

    renderFormation();
    await autoSaveSquad();
    showToast('Squad auto-built successfully!', 'success');
}

// Clear squad
function clearSquad() {
    currentSquad = {};
    renderFormation();
    autoSaveSquad();
    showToast('Squad cleared', 'info');
}

// Load squad from Firebase
async function loadSquadFromFirebase() {
    if (!currentUser) return;

    try {
        const { getUserProfile } = await import('./database.js');
        const profile = await getUserProfile(currentUser.uid);

        if (profile?.squad?.starters) {
            currentFormation = profile.squad.formation || '4-3-3';
            document.getElementById('formation-select').value = currentFormation;

            // Load players from club using instanceIds (key-based system)
            currentSquad = {};
            Object.entries(profile.squad.starters).forEach(([key, squadData]) => {
                const instanceId = squadData.instanceId;
                if (instanceId && profile.club && profile.club[instanceId]) {
                    currentSquad[key] = profile.club[instanceId];
                }
            });
        }
    } catch (error) {
        console.error('Error loading squad:', error);
    }
}

// Auto save squad to Firebase
async function autoSaveSquad() {
    if (!currentUser) return;

    try {
        const { saveSquad } = await import('./database.js');

        // Convert to instanceId format using key-based system
        const starters = {};
        Object.entries(currentSquad).forEach(([key, player]) => {
            starters[key] = { instanceId: player.instanceId };
        });

        await saveSquad(currentUser.uid, currentFormation, starters, {});
        console.log('Squad auto-saved');
    } catch (error) {
        console.error('Error auto-saving squad:', error);
    }
}

function updateRankDisplay() {
    // Use window.userProfile to get the latest data
    const profile = window.userProfile;
    if (!profile?.rankPoints) return;

    const currentPoints = profile.rankPoints;
    const currentRank = getRankFromPoints(currentPoints);
    const nextRankPoints = getPointsForRank(currentRank + 1);
    
    document.getElementById('user-rank-display').textContent = currentRank;
    document.getElementById('user-rank-display').className = `rank-badge ${getRankClass(currentRank)}`;
    document.getElementById('user-rank-points').textContent = currentPoints;
    document.getElementById('next-rank-points').textContent = nextRankPoints;
    
    console.log(`[App Controller] Rank display updated: ${currentPoints}/${nextRankPoints} (${currentRank})`);
}

// Make updateRankDisplay available globally for match.js
window.updateRankDisplay = updateRankDisplay;

/* ==========================================================================
   MATCHMAKING SCREEN INITIALIZATION
   ========================================================================== */

function initMatchmakingScreen() {
    console.log('[App Controller] Initializing matchmaking screen...');
    
    // Update rank display - reload profile first to get latest data
    if (window.currentUser) {
        getUserProfile(window.currentUser.uid).then(profile => {
            window.userProfile = profile;
            updateRankDisplay();
        }).catch(err => {
            console.error('[App Controller] Error loading profile:', err);
            updateRankDisplay(); // Try with existing data
        });
    }
    
    // Check for existing queue
    checkExistingQueue();
    
    // Bind matchmaking buttons
    const rankedBtn = document.querySelector('.ranked-btn');
    const unrankedBtn = document.querySelector('.unranked-btn');
    const friendBtn = document.querySelector('.friend-btn');
    const cancelBtn = document.getElementById('cancel-search-btn');
    
    if (rankedBtn) {
        rankedBtn.addEventListener('click', () => {
            startMatchmaking('ranked');
        });
    }
    
    if (unrankedBtn) {
        unrankedBtn.addEventListener('click', () => {
            startMatchmaking('unranked');
        });
    }
    
    if (friendBtn) {
        friendBtn.addEventListener('click', () => {
            startMatchmaking('friend');
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            cancelMatchmaking();
        });
    }
}

/* ==========================================================================
   MATCH SCREEN INITIALIZATION
   ========================================================================== */

function initMatchScreen() {
    console.log('[App Controller] Initializing match screen...');
    
    // Match is initialized by matchmaking system
    // No manual initialization needed here
    
    // Bind return to menu button
    const returnBtn = document.getElementById('return-to-menu-btn');
    if (returnBtn) {
        returnBtn.addEventListener('click', () => {
            document.getElementById('match-results-overlay').classList.add('hidden');
            switchScreen('dashboard');
        });
    }
}

/* ==========================================================================
   ADMIN SCREEN INITIALIZATION
   ========================================================================== */

async function initAdminScreen() {
    const adminNavItems = document.querySelectorAll('.admin-nav-item');

    adminNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-admin-section');
            
            adminNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`admin-${section}`).classList.add('active');

            // Load section data
            if (section === 'players') loadAdminPlayers();
            if (section === 'packs') loadAdminPacks();
            if (section === 'market') loadAdminMarket();
            if (section === 'users') loadAdminUsers();
        });
    });

    // Add Player button
    const addPlayerBtn = document.getElementById('admin-add-player-btn');
    if (addPlayerBtn) {
        addPlayerBtn.addEventListener('click', () => {
            showToast('Add player feature coming soon', 'info');
        });
    }

    // Export Players button
    const exportPlayersBtn = document.getElementById('admin-export-players-btn');
    if (exportPlayersBtn) {
        exportPlayersBtn.addEventListener('click', () => {
            showToast('Export database feature coming soon', 'info');
        });
    }

    // Import Players button
    const importPlayersBtn = document.getElementById('admin-import-players-btn');
    if (importPlayersBtn) {
        importPlayersBtn.addEventListener('click', () => {
            showToast('Import database feature coming soon', 'info');
        });
    }

    // Clear Market button
    const clearMarketBtn = document.getElementById('admin-clear-market-btn');
    if (clearMarketBtn) {
        clearMarketBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear ALL market listings? This cannot be undone.')) {
                try {
                    const { updateData } = await import('./database.js');
                    await updateData('market', {});
                    showToast('Market cleared successfully', 'success');
                    loadAdminMarket();
                } catch (error) {
                    console.error('[Admin] Error clearing market:', error);
                    showToast('Failed to clear market', 'error');
                }
            }
        });
    }

    // Seed Market button
    const seedMarketBtn = document.getElementById('admin-seed-market-btn');
    if (seedMarketBtn) {
        seedMarketBtn.addEventListener('click', async () => {
            try {
                const { seedMarketListings } = await import('./seedingService.js');
                await seedMarketListings();
                showToast('Market seeded successfully', 'success');
                loadAdminMarket();
            } catch (error) {
                console.error('[Admin] Error seeding market:', error);
                showToast('Failed to seed market', 'error');
            }
        });
    }

    // Load initial section
    loadAdminPlayers();
}

async function loadAdminPlayers() {
    const playersList = document.getElementById('admin-players-list');
    if (!playersList) return;

    try {
        const allPlayers = searchPlayers({}, 'rating', 'desc', 1, 50);
        
        playersList.innerHTML = '';
        allPlayers.results.forEach(player => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${player.id}</td>
                <td>${player.name}</td>
                <td>${player.rating}</td>
                <td>${player.position}</td>
                <td>${player.rarity}</td>
                <td>
                    <button class="btn btn-secondary admin-edit-player" data-player-id="${player.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
                    <button class="btn btn-danger admin-delete-player" data-player-id="${player.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Delete</button>
                </td>
            `;
            playersList.appendChild(row);
        });

        // Add event listeners for edit buttons
        document.querySelectorAll('.admin-edit-player').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const playerId = e.target.dataset.playerId;
                showToast('Edit player: ' + playerId, 'info');
            });
        });

        // Add event listeners for delete buttons
        document.querySelectorAll('.admin-delete-player').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const playerId = e.target.dataset.playerId;
                if (confirm('Are you sure you want to delete this player?')) {
                    showToast('Delete player: ' + playerId, 'info');
                }
            });
        });
    } catch (error) {
        console.error('[Admin] Error loading players:', error);
    }
}

async function loadAdminPacks() {
    const packsList = document.getElementById('admin-packs-list');
    if (!packsList) return;

    try {
        const packs = await getStorePacks();
        
        packsList.innerHTML = '';
        Object.values(packs).forEach(pack => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${pack.id}</td>
                <td>${pack.name}</td>
                <td>${formatCoins(pack.cost)}</td>
                <td>${pack.items}</td>
                <td>
                    <button class="btn btn-secondary admin-edit-pack" data-pack-id="${pack.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
                    <button class="btn btn-danger admin-delete-pack" data-pack-id="${pack.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Delete</button>
                </td>
            `;
            packsList.appendChild(row);
        });

        // Add event listeners for edit buttons
        document.querySelectorAll('.admin-edit-pack').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const packId = e.target.dataset.packId;
                showToast('Edit pack: ' + packId, 'info');
            });
        });

        // Add event listeners for delete buttons
        document.querySelectorAll('.admin-delete-pack').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const packId = e.target.dataset.packId;
                if (confirm('Are you sure you want to delete this pack?')) {
                    showToast('Delete pack: ' + packId, 'info');
                }
            });
        });
    } catch (error) {
        console.error('[Admin] Error loading packs:', error);
    }
}

async function loadAdminMarket() {
    try {
        const { readData } = await import('./database.js');
        const marketData = await readData('market');
        
        const activeListings = marketData ? Object.values(marketData).filter(l => l.status === 'active') : [];
        const totalCount = marketData ? Object.keys(marketData).length : 0;
        
        document.getElementById('admin-market-count').textContent = totalCount;
        document.getElementById('admin-market-active').textContent = activeListings.length;
        
        const marketList = document.getElementById('admin-market-list');
        if (marketList) {
            marketList.innerHTML = '';
            activeListings.slice(0, 20).forEach(listing => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${listing.id}</td>
                    <td>${listing.player.name}</td>
                    <td>${listing.player.rating}</td>
                    <td>${formatCoins(listing.buyNowPrice)}</td>
                    <td>${listing.sellerType}</td>
                    <td>
                        <button class="btn btn-danger admin-cancel-listing" data-listing-id="${listing.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Cancel</button>
                    </td>
                `;
                marketList.appendChild(row);
            });

            // Add event listeners for cancel buttons
            document.querySelectorAll('.admin-cancel-listing').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const listingId = e.target.dataset.listingId;
                    if (confirm('Are you sure you want to cancel this listing?')) {
                        showToast('Cancel listing: ' + listingId, 'info');
                    }
                });
            });
        }
    } catch (error) {
        console.error('[Admin] Error loading market:', error);
        document.getElementById('admin-market-count').textContent = 'Error';
        document.getElementById('admin-market-active').textContent = 'Error';
    }
}

async function loadAdminUsers() {
    const usersList = document.getElementById('admin-users-list');
    if (!usersList) return;

    try {
        const { readData } = await import('./database.js');
        const usersData = await readData('users');
        
        if (!usersData) {
            usersList.innerHTML = '<tr><td colspan="6" class="text-center">No users found</td></tr>';
            return;
        }

        usersList.innerHTML = '';
        Object.entries(usersData).forEach(([uid, userData]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${uid}</td>
                <td>${userData.profile?.clubName || 'Unknown'}</td>
                <td>${userData.economy?.coins || 0}</td>
                <td>${userData.stats?.rankPoints || 0}</td>
                <td>${userData.stats?.wins || 0}/${userData.stats?.losses || 0}</td>
                <td>
                    <button class="btn btn-secondary admin-view-user" data-user-id="${uid}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">View</button>
                    <button class="btn btn-danger admin-ban-user" data-user-id="${uid}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Ban</button>
                </td>
            `;
            usersList.appendChild(row);
        });

        // Add event listeners for view buttons
        document.querySelectorAll('.admin-view-user').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.dataset.userId;
                showToast('View user: ' + userId, 'info');
            });
        });

        // Add event listeners for ban buttons
        document.querySelectorAll('.admin-ban-user').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.dataset.userId;
                if (confirm('Are you sure you want to ban this user?')) {
                    showToast('Ban user: ' + userId, 'info');
                }
            });
        });
    } catch (error) {
        console.error('[Admin] Error loading users:', error);
        usersList.innerHTML = '<tr><td colspan="6" class="text-center">Error loading users</td></tr>';
    }
}

/* ==========================================================================
   TOAST NOTIFICATION SYSTEM
   ========================================================================== */

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `
        <i class="fa-solid ${icon} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Make showToast available globally for other modules
window.showToast = showToast;
