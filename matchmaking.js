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
    getUserClub,
    getOnlineUsers,
    createMatchState,
    setPlayerReady,
    startMatch as startFirebaseMatch,
    listenToMatchState,
    switchTurn,
    completeMatch,
    deleteMatchState
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
    keepAliveInterval: null,
    currentMatchId: null,
    matchStateListener: null,
    playerNum: null // 'player1' or 'player2'
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
        // Set user as online
        await setUserOnline(matchmakingState.currentUserId);
        
        // Start keep-alive interval
        matchmakingState.keepAliveInterval = setInterval(() => {
            updateUserLastSeen(matchmakingState.currentUserId);
        }, MATCHMAKING_CONFIG.ONLINE_KEEP_ALIVE_INTERVAL);
        
        showSearchingUI(matchType);
        startSearchTimer();
        startOpponentSearch();
    } catch (error) {
        console.error('[Matchmaking] Failed to start matchmaking:', error);
        cancelMatchmaking();
        window.showToast('Failed to start matchmaking.', 'error');
    }
}

/**
 * Start Friend matchmaking
 */
async function startFriendMatchmaking() {
    console.log('[Matchmaking] Starting friend matchmaking');

    try {
        // Set user as online
        await setUserOnline(matchmakingState.currentUserId);
        
        // Start keep-alive interval
        matchmakingState.keepAliveInterval = setInterval(() => {
            updateUserLastSeen(matchmakingState.currentUserId);
        }, MATCHMAKING_CONFIG.ONLINE_KEEP_ALIVE_INTERVAL);
        
        showSearchingUI('friend');
        startFriendSearch();
    } catch (error) {
        console.error('[Matchmaking] Failed to start friend matchmaking:', error);
        cancelMatchmaking();
        window.showToast('Failed to start friend matchmaking.', 'error');
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
            clearInterval(matchmakingState.matchListener);
            clearInterval(matchmakingState.keepAliveInterval);
            fallbackToAI();
        }
    }, 1000);
}

/**
 * Start friend search - randomly pick from online users
 */
function startFriendSearch() {
    updateSearchStatus('Waiting for friend to join...');

    matchmakingState.friendCheckInterval = setInterval(async () => {
        try {
            const onlineUsers = await getOnlineUsers();
            console.log('[Matchmaking] Online users for friend match:', onlineUsers.length);
            
            // Filter out current user
            const potentialFriends = onlineUsers.filter(user => 
                user.userId !== matchmakingState.currentUserId
            );

            console.log('[Matchmaking] Potential friends:', potentialFriends.length);

            if (potentialFriends.length > 0) {
                // Randomly pick a friend
                const randomFriend = potentialFriends[Math.floor(Math.random() * potentialFriends.length)];
                console.log('[Matchmaking] Found random online friend:', randomFriend.clubName);
                
                // Fetch friend's squad data
                const friendSquad = await getUserSquad(randomFriend.userId);
                const friendClub = await getUserClub(randomFriend.userId);
                
                if (!friendSquad) {
                    console.error('[Matchmaking] Failed to fetch friend squad');
                    return; // Keep searching
                }

                // Convert friend squad instanceIds to actual player data
                const friendSquadWithPlayers = {};
                if (friendSquad.starters) {
                    Object.entries(friendSquad.starters).forEach(([key, starter]) => {
                        const instanceId = starter.instanceId;
                        if (instanceId && friendClub && friendClub[instanceId]) {
                            friendSquadWithPlayers[key] = friendClub[instanceId];
                        } else if (starter.name) {
                            // Already has player data
                            friendSquadWithPlayers[key] = starter;
                        }
                    });
                }
                
                const fullFriendSquad = {
                    ...friendSquad,
                    starters: friendSquadWithPlayers
                };

                // Stop friend check
                if (matchmakingState.friendCheckInterval) {
                    clearInterval(matchmakingState.friendCheckInterval);
                }

                // Stop keep-alive
                if (matchmakingState.keepAliveInterval) {
                    clearInterval(matchmakingState.keepAliveInterval);
                }

                // Start match
                hideSearchingUI();
                startMatchWithRealOpponent({
                    id: `friend_match_${Date.now()}`,
                    opponentId: randomFriend.userId,
                    opponentName: randomFriend.clubName || 'Friend',
                    opponentSquad: fullFriendSquad
                });
            }
        } catch (error) {
            console.error('[Matchmaking] Error checking for friend match:', error);
        }
    }, MATCHMAKING_CONFIG.FRIEND_SEARCH_CHECK_INTERVAL);
}

/**
 * Start opponent search - randomly pick from online users
 */
function startOpponentSearch() {
    updateSearchStatus('Searching for online opponents...');
    
    matchmakingState.matchListener = setInterval(async () => {
        try {
            const onlineUsers = await getOnlineUsers();
            console.log('[Matchmaking] Online users found:', onlineUsers.length);
            
            // Filter out current user
            const potentialOpponents = onlineUsers.filter(user => 
                user.userId !== matchmakingState.currentUserId
            );

            console.log('[Matchmaking] Potential opponents:', potentialOpponents.length);

            if (potentialOpponents.length > 0) {
                // Randomly pick an opponent
                const randomOpponent = potentialOpponents[Math.floor(Math.random() * potentialOpponents.length)];
                console.log('[Matchmaking] Found random online opponent:', randomOpponent.clubName);
                
                // Fetch opponent's squad data
                const opponentSquad = await getUserSquad(randomOpponent.userId);
                const opponentClub = await getUserClub(randomOpponent.userId);
                
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

                // Get current user's squad data
                const userSquad = window.userProfile?.squad;
                const userClub = window.userProfile?.club;
                const userSquadWithPlayers = {};
                if (userSquad?.starters) {
                    Object.entries(userSquad.starters).forEach(([key, starter]) => {
                        const instanceId = starter.instanceId;
                        if (instanceId && userClub && userClub[instanceId]) {
                            userSquadWithPlayers[key] = userClub[instanceId];
                        } else if (starter.name) {
                            userSquadWithPlayers[key] = starter;
                        }
                    });
                }
                
                const fullUserSquad = {
                    ...userSquad,
                    starters: userSquadWithPlayers
                };

                // Create shared match state
                const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                matchmakingState.currentMatchId = matchId;
                
                await createMatchState(
                    matchId,
                    matchmakingState.currentUserId,
                    randomOpponent.userId,
                    fullUserSquad,
                    fullOpponentSquad,
                    matchmakingState.matchType
                );

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

                // Set current player as player1
                matchmakingState.playerNum = 'player1';

                // Start match
                hideSearchingUI();
                startRealTimeMatch(matchId, 'player1', randomOpponent.userId, randomOpponent.clubName || 'Opponent');
            }
        } catch (error) {
            console.error('[Matchmaking] Error searching for opponent:', error);
        }
    }, 2000);
}

/**
 * Fallback to AI opponent
 */
async function fallbackToAI() {
    console.log('[Matchmaking] No opponent found, falling back to AI');

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
 * Start real-time match with shared state
 */
function startRealTimeMatch(matchId, playerNum, opponentId, opponentName) {
    console.log('[Matchmaking] Starting real-time match:', matchId, 'as', playerNum);
    
    // Show ready screen with waiting for opponent
    showRealTimeReadyScreen(matchId, playerNum, opponentId, opponentName);
    
    // Set current player as ready
    setPlayerReady(matchId, playerNum);
    
    // Listen to match state changes
    matchmakingState.matchStateListener = listenToMatchState(matchId, (matchState) => {
        console.log('[Matchmaking] Match state updated:', matchState);
        
        // Check if both players are ready
        if (matchState.player1.ready && matchState.player2.ready && matchState.status === 'waiting') {
            // Both ready, start the match
            startFirebaseMatch(matchId);
        }
        
        // If match is in progress, initialize the match engine
        if (matchState.status === 'in_progress') {
            // Initialize match with shared state
            initializeRealTimeMatch(matchState);
        }
    });
}

/**
 * Show real-time ready screen
 */
function showRealTimeReadyScreen(matchId, playerNum, opponentId, opponentName) {
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    const readyContainer = document.getElementById('ready-screen-container');
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingScreen || !readyContainer) return;
    
    // Hide matchmaking options, show ready container
    if (matchmakingOptions) matchmakingOptions.classList.add('hidden');
    readyContainer.classList.remove('hidden');
    
    readyContainer.innerHTML = `
        <div class="ready-screen">
            <h2>MATCH FOUND!</h2>
            <div class="ready-squads">
                <div class="ready-squad">
                    <h3>${playerNum === 'player1' ? 'Your Squad' : 'Opponent Squad'}</h3>
                    <div class="ready-players">
                        <p class="text-muted">Waiting for opponent...</p>
                    </div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="ready-squad">
                    <h3>${opponentName}</h3>
                    <div class="ready-players">
                        <p class="text-muted">Waiting for opponent...</p>
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
            readyBtn.textContent = 'READY!';
            readyBtn.disabled = true;
            
            // Set player as ready
            setPlayerReady(matchId, playerNum);
        });
    }
}

/**
 * Initialize real-time match with shared state
 */
function initializeRealTimeMatch(matchState) {
    console.log('[Matchmaking] Initializing real-time match with state:', matchState);
    
    // Clear ready screen
    const readyContainer = document.getElementById('ready-screen-container');
    if (readyContainer) {
        readyContainer.innerHTML = '';
        readyContainer.classList.add('hidden');
    }
    
    // Show matchmaking options again
    const matchmakingOptions = document.getElementById('matchmaking-options');
    if (matchmakingOptions) matchmakingOptions.classList.remove('hidden');
    
    // Switch to match screen
    const screens = document.querySelectorAll('.app-screen');
    screens.forEach(screen => screen.classList.add('hidden'));
    document.getElementById('match-screen').classList.remove('hidden');
    
    // Store match state globally for match engine to use
    window.sharedMatchState = matchState;
    window.currentPlayerNum = matchmakingState.playerNum;
    
    // Initialize match engine
    import('./match.js').then(module => {
        module.initializeMatch(matchmakingState.matchType || 'unranked', {
            isRealTime: true,
            matchId: matchmakingState.currentMatchId,
            playerNum: matchmakingState.playerNum
        });
    });
}

/**
 * Start match with AI (fallback)
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