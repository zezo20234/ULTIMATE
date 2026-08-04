/* ==========================================================================
   MATCHMAKING SYSTEM
   Handles Ranked, Unranked, and Friend matchmaking with Firebase integration
   ========================================================================== */

import { 
    joinMatchmakingQueue, 
    leaveMatchmakingQueue, 
    getMatchmakingQueue, 
    findMatchOpponent,
    createMatch,
    setUserOnline,
    setUserOffline,
    updateUserLastSeen,
    getUserSquad,
    getUserClub
} from './database.js';
import { initializeMatch } from './match.js';

// Matchmaking Configuration
const MATCHMAKING_CONFIG = {
    SEARCH_DURATION: 20, // seconds for Ranked/Unranked
    FRIEND_SEARCH_CHECK_INTERVAL: 2000, // ms
    ONLINE_KEEP_ALIVE_INTERVAL: 30000 // ms - update online status every 30s
};

// Matchmaking State
let matchmakingState = {
    isActive: false,
    matchType: null, // 'ranked', 'unranked', 'friend'
    searchStartTime: null,
    searchTimer: null,
    friendCheckInterval: null,
    queueListener: null,
    matchListener: null,
    currentUserId: null,
    queueId: null,
    keepAliveInterval: null
};

/**
 * Initialize matchmaking for a specific match type
 */
export function startMatchmaking(matchType) {
    if (matchmakingState.isActive) {
        console.warn('[Matchmaking] Already searching for a match');
        return;
    }

    const currentUser = window.currentUser;
    if (!currentUser) {
        window.showToast('You must be logged in to play matches.', 'error');
        return;
    }

    // Check cooldown
    const cooldownEnd = localStorage.getItem('matchCooldownEnd');
    if (cooldownEnd && Date.now() < parseInt(cooldownEnd)) {
        showMatchmakingCooldown(parseInt(cooldownEnd));
        return;
    }

    matchmakingState.isActive = true;
    matchmakingState.matchType = matchType;
    matchmakingState.searchStartTime = Date.now();
    matchmakingState.currentUserId = currentUser.uid;

    // Set user as online
    setUserOnline(currentUser.uid);
    
    // Start keep-alive interval
    matchmakingState.keepAliveInterval = setInterval(() => {
        updateUserLastSeen(currentUser.uid);
    }, MATCHMAKING_CONFIG.ONLINE_KEEP_ALIVE_INTERVAL);

    showSearchingUI(matchType);

    if (matchType === 'friend') {
        startFriendMatchmaking();
    } else {
        startRankedOrUnrankedMatchmaking(matchType);
    }
}

/**
 * Start Ranked or Unranked matchmaking
 */
async function startRankedOrUnrankedMatchmaking(matchType) {
    console.log(`[Matchmaking] Starting ${matchType} matchmaking`);

    try {
        // Create queue entry using database function
        const squadData = {
            rating: window.userProfile?.squad?.rating || 75,
            playerCount: Object.keys(window.userProfile?.squad?.starters || {}).length,
            clubName: window.userProfile?.profile?.clubName || 'Unknown'
        };
        
        matchmakingState.queueId = await joinMatchmakingQueue(
            matchmakingState.currentUserId, 
            matchType, 
            squadData
        );
        
        console.log('[Matchmaking] Added to queue');
        startSearchTimer();
        listenForMatchFound();
    } catch (error) {
        console.error('[Matchmaking] Failed to join queue:', error);
        cancelMatchmaking();
        window.showToast('Failed to join matchmaking queue.', 'error');
    }
}

/**
 * Start Friend matchmaking
 */
async function startFriendMatchmaking() {
    console.log('[Matchmaking] Starting friend matchmaking');

    try {
        // Create queue entry using database function
        const squadData = {
            rating: window.userProfile?.squad?.rating || 75,
            playerCount: Object.keys(window.userProfile?.squad?.starters || {}).length,
            waitingForFriend: true,
            clubName: window.userProfile?.profile?.clubName || 'Unknown'
        };
        
        matchmakingState.queueId = await joinMatchmakingQueue(
            matchmakingState.currentUserId, 
            'friend', 
            squadData
        );
        
        console.log('[Matchmaking] Added to friend queue');
        startFriendSearchCheck();
    } catch (error) {
        console.error('[Matchmaking] Failed to join friend queue:', error);
        cancelMatchmaking();
        window.showToast('Failed to join friend queue.', 'error');
    }
}

/**
 * Start search timer for Ranked/Unranked
 */
function startSearchTimer() {
    let timeLeft = MATCHMAKING_CONFIG.SEARCH_DURATION;
    
    updateSearchTimer(timeLeft);

    matchmakingState.searchTimer = setInterval(() => {
        timeLeft--;
        updateSearchTimer(timeLeft);

        if (timeLeft <= 0) {
            // Time elapsed - fallback to AI
            clearInterval(matchmakingState.searchTimer);
            fallbackToAI();
        }
    }, 1000);
}

/**
 * Start friend search check
 */
function startFriendSearchCheck() {
    updateSearchStatus('Waiting for friend to join...');

    matchmakingState.friendCheckInterval = setInterval(() => {
        checkForFriendMatch();
    }, MATCHMAKING_CONFIG.FRIEND_SEARCH_CHECK_INTERVAL);
}

/**
 * Check for friend match
 */
async function checkForFriendMatch() {
    try {
        const queue = await getMatchmakingQueue('friend');
        
        const friendQueues = queue.filter(entry => 
            entry.userId !== matchmakingState.currentUserId &&
            entry.squadData?.waitingForFriend
        );

        if (friendQueues.length > 0) {
            // Found a friend - match with them
            const friendData = friendQueues[0];
            createFriendMatch(friendData.id, friendData);
        }
    } catch (error) {
        console.error('[Matchmaking] Error checking for friend match:', error);
    }
}

/**
 * Create friend match
 */
async function createFriendMatch(friendQueueId, friendData) {
    console.log('[Matchmaking] Friend match found!');

    try {
        // Remove both from queue
        await leaveMatchmakingQueue(matchmakingState.queueId);
        await leaveMatchmakingQueue(friendQueueId);

        // Stop friend check
        if (matchmakingState.friendCheckInterval) {
            clearInterval(matchmakingState.friendCheckInterval);
        }

        // Stop keep-alive
        if (matchmakingState.keepAliveInterval) {
            clearInterval(matchmakingState.keepAliveInterval);
        }

        // Fetch opponent's squad data
        const opponentSquad = await getUserSquad(friendData.userId);
        const opponentClub = await getUserClub(friendData.userId);
        
        if (!opponentSquad) {
            console.error('[Matchmaking] Failed to fetch opponent squad');
            window.showToast('Failed to load opponent squad. Falling back to AI.', 'error');
            startMatchWithAI('friend');
            return;
        }

        // Convert opponent squad instanceIds to actual player data
        const opponentSquadWithPlayers = {};
        if (opponentSquad.starters) {
            Object.entries(opponentSquad.starters).forEach(([key, starter]) => {
                const instanceId = starter.instanceId;
                if (instanceId && opponentClub && opponentClub[instanceId]) {
                    opponentSquadWithPlayers[key] = opponentClub[instanceId];
                } else if (starter.name) {
                    // Already has player data
                    opponentSquadWithPlayers[key] = starter;
                }
            });
        }
        
        const fullOpponentSquad = {
            ...opponentSquad,
            starters: opponentSquadWithPlayers
        };

        // Create match entry
        const matchId = await createMatch(
            matchmakingState.currentUserId,
            friendData.userId,
            'friend'
        );

        console.log('[Matchmaking] Friend match created');
        hideSearchingUI();
        
        // Start match with real opponent
        startMatchWithRealOpponent({
            id: matchId,
            opponentId: friendData.userId,
            opponentName: friendData.clubName || 'Friend',
            opponentSquad: fullOpponentSquad
        });
    } catch (error) {
        console.error('[Matchmaking] Failed to create friend match:', error);
        window.showToast('Failed to create friend match.', 'error');
        cancelMatchmaking();
    }
}

/**
 * Listen for match found
 */
function listenForMatchFound() {
    // Simplified: periodic check instead of real-time listener
    matchmakingState.matchListener = setInterval(async () => {
        try {
            const opponent = await findMatchOpponent(
                matchmakingState.currentUserId,
                matchmakingState.matchType,
                window.userProfile?.squad?.rating || 75
            );

            if (opponent) {
                console.log('[Matchmaking] Opponent found!');
                
                // Fetch opponent's squad data
                const opponentSquad = await getUserSquad(opponent.userId);
                const opponentClub = await getUserClub(opponent.userId);
                
                if (!opponentSquad) {
                    console.error('[Matchmaking] Failed to fetch opponent squad');
                    return; // Keep searching
                }

                // Convert opponent squad instanceIds to actual player data
                const opponentSquadWithPlayers = {};
                if (opponentSquad.starters) {
                    Object.entries(opponentSquad.starters).forEach(([key, starter]) => {
                        const instanceId = starter.instanceId;
                        if (instanceId && opponentClub && opponentClub[instanceId]) {
                            opponentSquadWithPlayers[key] = opponentClub[instanceId];
                        } else if (starter.name) {
                            // Already has player data
                            opponentSquadWithPlayers[key] = starter;
                        }
                    });
                }
                
                const fullOpponentSquad = {
                    ...opponentSquad,
                    starters: opponentSquadWithPlayers
                };

                // Create match
                const matchId = await createMatch(
                    matchmakingState.currentUserId,
                    opponent.userId,
                    matchmakingState.matchType
                );

                // Remove from queue
                if (matchmakingState.queueId) {
                    await leaveMatchmakingQueue(matchmakingState.queueId);
                }

                // Stop search timer
                if (matchmakingState.searchTimer) {
                    clearInterval(matchmakingState.searchTimer);
                }

                // Stop keep-alive
                if (matchmakingState.keepAliveInterval) {
                    clearInterval(matchmakingState.keepAliveInterval);
                }

                // Stop listener
                if (matchmakingState.matchListener) {
                    clearInterval(matchmakingState.matchListener);
                }

                // Start match
                hideSearchingUI();
                startMatchWithRealOpponent({
                    id: matchId,
                    opponentId: opponent.userId,
                    opponentName: opponent.clubName || 'Opponent',
                    opponentSquad: fullOpponentSquad
                });
            }
        } catch (error) {
            console.error('[Matchmaking] Error checking for opponent:', error);
        }
    }, 2000);
}

/**
 * Fallback to AI opponent
 */
async function fallbackToAI() {
    console.log('[Matchmaking] No opponent found, falling back to AI');
    
    // Remove from queue
    if (matchmakingState.queueId) {
        await leaveMatchmakingQueue(matchmakingState.queueId);
    }

    // Stop listeners
    if (matchmakingState.matchListener) {
        clearInterval(matchmakingState.matchListener);
    }

    // Stop keep-alive
    if (matchmakingState.keepAliveInterval) {
        clearInterval(matchmakingState.keepAliveInterval);
    }

    // Set user offline
    if (matchmakingState.currentUserId) {
        try {
            await setUserOffline(matchmakingState.currentUserId);
        } catch (error) {
            console.error('[Matchmaking] Error setting user offline:', error);
        }
    }

    hideSearchingUI();
    window.showToast('No opponent found. Matching against an AI club.', 'info');
    
    // Small delay before starting match
    setTimeout(() => {
        startMatchWithAI(matchmakingState.matchType);
    }, 1000);
}

/**
 * Start match with AI
 */
function startMatchWithAI(matchType) {
    console.log(`[Matchmaking] Starting ${matchType} match vs AI`);
    
    // Stop keep-alive and set offline for AI matches
    if (matchmakingState.keepAliveInterval) {
        clearInterval(matchmakingState.keepAliveInterval);
    }
    if (matchmakingState.currentUserId) {
        setUserOffline(matchmakingState.currentUserId);
    }
    
    // Show ready screen
    showReadyScreen('AI', window.userProfile?.squad?.starters || {});
}

/**
 * Start match with real opponent
 */
function startMatchWithRealOpponent(matchData) {
    console.log('[Matchmaking] Starting match vs real opponent:', matchData.opponentName);
    
    // Show ready screen with opponent squad
    showReadyScreen(matchData.opponentName || 'Opponent', matchData.opponentSquad || {}, matchData);
}

/**
 * Show ready screen with both squads
 */
function showReadyScreen(opponentName, opponentSquad, matchData = null) {
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    const readyContainer = document.getElementById('ready-screen-container');
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingScreen || !readyContainer) return;

    const mySquad = window.userProfile?.squad?.starters || {};
    const myFormation = window.userProfile?.squad?.formation || '4-3-3';

    // Convert my squad keys to actual player data
    const myPlayers = [];
    Object.entries(mySquad).forEach(([key, squadData]) => {
        const instanceId = squadData.instanceId;
        if (instanceId && window.userProfile?.club?.[instanceId]) {
            myPlayers.push(window.userProfile.club[instanceId]);
        }
    });

    // Convert opponent squad if it's in instanceId format
    const opponentPlayers = [];
    
    if (opponentName === 'AI') {
        // AI match - opponentSquad has direct player data
        Object.entries(opponentSquad).forEach(([key, squadData]) => {
            if (squadData.name) {
                opponentPlayers.push(squadData);
            }
        });
    } else {
        // Real opponent - opponentSquad has starters with player data already converted
        if (opponentSquad.starters) {
            Object.entries(opponentSquad.starters).forEach(([key, squadData]) => {
                if (squadData.name) {
                    opponentPlayers.push(squadData);
                }
            });
        } else {
            Object.entries(opponentSquad).forEach(([key, squadData]) => {
                if (squadData.name) {
                    opponentPlayers.push(squadData);
                }
            });
        }
    }

    // Hide matchmaking options, show ready container
    if (matchmakingOptions) matchmakingOptions.classList.add('hidden');
    readyContainer.classList.remove('hidden');

    readyContainer.innerHTML = `
        <div class="ready-screen">
            <h2>MATCH FOUND!</h2>
            <div class="ready-squads">
                <div class="ready-squad">
                    <h3>Your Squad (${myFormation})</h3>
                    <div class="ready-players">
                        ${myPlayers.slice(0, 11).map(p => `
                            <div class="ready-player">
                                <span class="ready-rating">${p.rating || '?'}</span>
                                <span class="ready-name">${p.name || 'Unknown'}</span>
                                <span class="ready-position">${p.position || '?'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="ready-squad">
                    <h3>${opponentName}</h3>
                    <div class="ready-players">
                        ${opponentPlayers.slice(0, 11).map(p => `
                            <div class="ready-player">
                                <span class="ready-rating">${p.rating || '?'}</span>
                                <span class="ready-name">${p.name || 'Unknown'}</span>
                                <span class="ready-position">${p.position || '?'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="ready-actions">
                <button id="ready-btn" class="btn btn-primary btn-lg">READY</button>
            </div>
        </div>
    `;

    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        readyBtn.addEventListener('click', () => {
            readyBtn.textContent = 'WAITING FOR OPPONENT...';
            readyBtn.disabled = true;
            
            // Simulate opponent ready after 2 seconds
            setTimeout(() => {
                readyBtn.textContent = 'STARTING MATCH...';
                setTimeout(() => {
                    // Clear ready screen
                    readyContainer.innerHTML = '';
                    readyContainer.classList.add('hidden');
                    
                    // Show matchmaking options again
                    if (matchmakingOptions) matchmakingOptions.classList.remove('hidden');
                    
                    // Switch to match screen
                    const screens = document.querySelectorAll('.app-screen');
                    screens.forEach(screen => screen.classList.add('hidden'));
                    document.getElementById('match-screen').classList.remove('hidden');

                    // Initialize match with opponent squad if real match
                    const opponentSquadData = matchData && opponentName !== 'AI' ? 
                        { opponentId: matchData.opponentId, opponentSquad: matchData.opponentSquad } : null;
                    
                    initializeMatch(matchmakingState.matchType || 'unranked', opponentSquadData);
                    
                    // Reset matchmaking state
                    resetMatchmakingState();
                }, 1000);
            }, 2000);
        });
    }
}

/**
 * Cancel matchmaking
 */
export async function cancelMatchmaking() {
    console.log('[Matchmaking] Cancelling matchmaking');

    // Stop timers
    if (matchmakingState.searchTimer) {
        clearInterval(matchmakingState.searchTimer);
    }
    if (matchmakingState.friendCheckInterval) {
        clearInterval(matchmakingState.friendCheckInterval);
    }
    if (matchmakingState.keepAliveInterval) {
        clearInterval(matchmakingState.keepAliveInterval);
    }

    // Stop listeners
    if (matchmakingState.matchListener) {
        clearInterval(matchmakingState.matchListener);
    }

    // Remove from queue
    if (matchmakingState.queueId) {
        try {
            await leaveMatchmakingQueue(matchmakingState.queueId);
        } catch (error) {
            console.error('[Matchmaking] Error leaving queue:', error);
        }
    }

    // Set user offline
    if (matchmakingState.currentUserId) {
        try {
            await setUserOffline(matchmakingState.currentUserId);
        } catch (error) {
            console.error('[Matchmaking] Error setting user offline:', error);
        }
    }

    hideSearchingUI();
    resetMatchmakingState();
}

/**
 * Reset matchmaking state
 */
function resetMatchmakingState() {
    matchmakingState = {
        isActive: false,
        matchType: null,
        searchStartTime: null,
        searchTimer: null,
        friendCheckInterval: null,
        queueListener: null,
        matchListener: null,
        currentUserId: null,
        queueId: null
    };
    
    // Reset matchmaking screen to default view
    const readyContainer = document.getElementById('ready-screen-container');
    const matchmakingOptions = document.getElementById('matchmaking-options');
    if (readyContainer) {
        readyContainer.innerHTML = '';
        readyContainer.classList.add('hidden');
    }
    if (matchmakingOptions) {
        matchmakingOptions.classList.remove('hidden');
    }
}

/**
 * Show searching UI
 */
function showSearchingUI(matchType) {
    const overlay = document.getElementById('search-overlay');
    const statusText = document.getElementById('search-status');
    
    if (overlay) overlay.classList.remove('hidden');
    
    if (matchType === 'friend') {
        if (statusText) statusText.textContent = 'Waiting for friend to join...';
    } else {
        if (statusText) statusText.textContent = 'Searching for opponent...';
    }
}

/**
 * Hide searching UI
 */
function hideSearchingUI() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/**
 * Update search timer display
 */
function updateSearchTimer(timeLeft) {
    const timerEl = document.getElementById('search-timer');
    if (timerEl) {
        timerEl.textContent = timeLeft;
    }
}

/**
 * Update search status text
 */
function updateSearchStatus(text) {
    const statusEl = document.getElementById('search-status');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

/**
 * Show matchmaking cooldown
 */
function showMatchmakingCooldown(endTime) {
    const cooldownDisplay = document.getElementById('matchmaking-cooldown');
    const timerDisplay = document.getElementById('cooldown-timer-display');
    
    if (cooldownDisplay) cooldownDisplay.classList.remove('hidden');
    
    const updateTimer = () => {
        const now = Date.now();
        const remaining = endTime - now;
        
        if (remaining <= 0) {
            if (cooldownDisplay) cooldownDisplay.classList.add('hidden');
            return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        if (timerDisplay) timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        setTimeout(updateTimer, 1000);
    };
    
    updateTimer();
}

/**
 * Check for existing queue on page load
 */
export async function checkExistingQueue() {
    const currentUser = window.currentUser;
    if (!currentUser) return;

    // Check if user was in a queue
    const savedQueueId = localStorage.getItem(`queue_${currentUser.uid}`);
    if (savedQueueId) {
        console.log('[Matchmaking] Found existing queue, cleaning up');
        try {
            await leaveMatchmakingQueue(savedQueueId);
        } catch (error) {
            console.error('[Matchmaking] Error cleaning up queue:', error);
        }
        localStorage.removeItem(`queue_${currentUser.uid}`);
    }
}

/**
 * Save queue state
 */
function saveQueueState() {
    if (matchmakingState.queueId && matchmakingState.currentUserId) {
        localStorage.setItem(`queue_${matchmakingState.currentUserId}`, matchmakingState.queueId);
    }
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
    if (matchmakingState.isActive && matchmakingState.queueId) {
        saveQueueState();
    }
});