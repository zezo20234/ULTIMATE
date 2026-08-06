/* ==========================================================================
   MATCHMAKING SYSTEM - COMPLETE REBUILD
   Handles Ranked, Unranked, and Friend matchmaking with Firebase integration
   10-rank system, 20-second search, AI fallback, room codes
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
    deleteMatchState,
    setQueueStatus,
    listenToQueueEntry,
    createLobby,
    joinLobbyByRoomCode,
    getLobby,
    listenToLobby,
    deleteLobby,
    getRankPoints,
    updateRankPoints,
    setMatchCooldown,
    getMatchCooldown,
    clearMatchCooldown
} from './database.js';
import { initializeMatch } from './match.js';
import { getRankFromPoints, getRankTier, generateRoomCode, getPointsToNextRank } from './utils.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { db } from './firebase.js';

// Matchmaking Configuration
const MATCHMAKING_CONFIG = {
    SEARCH_DURATION: 20, // seconds for Ranked/Unranked
    FRIEND_SEARCH_CHECK_INTERVAL: 2000, // ms
    ONLINE_KEEP_ALIVE_INTERVAL: 30000, // ms - update online status every 30s
    RANKED_WIN_POINTS: 25,
    RANKED_LOSS_POINTS: 15,
    RANKED_DRAW_POINTS: 5,
    UNRANKED_COIN_REWARD: 500,
    RANKED_COIN_REWARD: 1000
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
    playerNum: null, // 'player1' or 'player2'
    currentLobbyId: null,
    lobbyListener: null,
    roomCode: null,
    isHost: false
};

/**
 * Initialize matchmaking for a specific match type
 */
export function startMatchmaking(matchType) {
    console.log(`[Matchmaking] Starting ${matchType} matchmaking`);
    
    // Always reset state first to clear any previous matchmaking
    if (matchmakingState.isActive) {
        console.log('[Matchmaking] Clearing previous matchmaking state');
        cleanupMatchmakingState();
    }
    
    // Reset state
    matchmakingState = {
        isActive: false,
        matchType: null,
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
        playerNum: null,
        currentLobbyId: null,
        lobbyListener: null,
        roomCode: null,
        isHost: false
    };

    const currentUser = window.currentUser;
    if (!currentUser) {
        window.showToast('You must be logged in to play matches.', 'error');
        return;
    }

    // Check cooldown for ranked/unranked
    if (matchType !== 'friend') {
        checkCooldownAndStart(matchType, currentUser);
    } else {
        // Friend mode - show room code options
        showFriendModeOptions();
    }
}

/**
 * Check cooldown and start matchmaking if clear
 */
async function checkCooldownAndStart(matchType, currentUser) {
    try {
        const cooldownEnd = await getMatchCooldown(currentUser.uid);
        if (cooldownEnd && Date.now() < cooldownEnd) {
            showMatchmakingCooldown(cooldownEnd);
            return;
        }
        
        matchmakingState.isActive = true;
        matchmakingState.matchType = matchType;
        matchmakingState.searchStartTime = Date.now();
        matchmakingState.currentUserId = currentUser.uid;

        if (matchType === 'ranked' || matchType === 'unranked') {
            await startRankedOrUnrankedMatchmaking(matchType);
        }
    } catch (error) {
        console.error('[Matchmaking] Error checking cooldown:', error);
        window.showToast('Failed to start matchmaking.', 'error');
    }
}

/**
 * Start Ranked or Unranked matchmaking
 */
async function startRankedOrUnrankedMatchmaking(matchType) {
    console.log(`[Matchmaking] Starting ${matchType} matchmaking`);
    console.log('[Matchmaking] Current user ID:', matchmakingState.currentUserId);

    try {
        // Set user as online
        await setUserOnline(matchmakingState.currentUserId);
        
        // Get user's squad data
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
        
        console.log('[Matchmaking] User squad:', fullUserSquad);
        
        // Get user's rank points for ranked matching
        let rankPoints = 0;
        if (matchType === 'ranked') {
            rankPoints = await getRankPoints(matchmakingState.currentUserId);
            console.log('[Matchmaking] User rank points:', rankPoints);
        }
        
        // Create queue entry with squad data
        const squadData = {
            rating: window.userProfile?.squad?.rating || 75,
            playerCount: Object.keys(window.userProfile?.squad?.starters || {}).length,
            clubName: window.userProfile?.profile?.clubName || 'Unknown',
            squad: fullUserSquad,
            rankPoints: rankPoints,
            rankTier: getRankTier(rankPoints)
        };
        
        matchmakingState.queueId = await joinMatchmakingQueue(
            matchmakingState.currentUserId, 
            matchType, 
            squadData
        );
        
        console.log('[Matchmaking] Added to queue:', matchmakingState.queueId);
        
        // Start keep-alive interval
        matchmakingState.keepAliveInterval = setInterval(() => {
            updateUserLastSeen(matchmakingState.currentUserId);
        }, MATCHMAKING_CONFIG.ONLINE_KEEP_ALIVE_INTERVAL);
        
        showSearchingUI(matchType);
        startSearchTimer(matchType);
        startQueueMatching(matchType, rankPoints);
    } catch (error) {
        console.error('[Matchmaking] Failed to start matchmaking:', error);
        cancelMatchmaking();
        window.showToast('Failed to start matchmaking.', 'error');
    }
}

/**
 * Start search timer (20 seconds)
 */
function startSearchTimer(matchType) {
    let timeLeft = MATCHMAKING_CONFIG.SEARCH_DURATION;
    
    matchmakingState.searchTimer = setInterval(() => {
        timeLeft--;
        updateSearchTimerUI(timeLeft);
        
        if (timeLeft <= 0) {
            clearInterval(matchmakingState.searchTimer);
            console.log('[Matchmaking] Search timed out, falling back to AI');
            fallbackToAI(matchType);
        }
    }, 1000);
}

/**
 * Update search timer UI
 */
function updateSearchTimerUI(timeLeft) {
    const timerElement = document.getElementById('search-timer');
    if (timerElement) {
        timerElement.textContent = `Searching for opponent... ${timeLeft}s`;
    }
}

/**
 * Start queue matching process
 */
function startQueueMatching(matchType, userRankPoints) {
    console.log('[Matchmaking] Starting queue matching');
    
    // Listen for match found
    matchmakingState.queueListener = listenToQueueEntry(matchmakingState.queueId, async (queueEntry) => {
        console.log('[Matchmaking] Queue entry updated:', queueEntry);
        
        if (queueEntry.status === 'matched' && queueEntry.matchId) {
            console.log('[Matchmaking] Match found:', queueEntry.matchId);
            clearInterval(matchmakingState.searchTimer);
            matchmakingState.currentMatchId = queueEntry.matchId;
            
            // Show match found and start match
            await handleMatchFound(queueEntry.matchId, matchType);
        }
    });
    
    // Also actively search for opponents (client-side matching)
    searchForOpponent(matchType, userRankPoints);
}

/**
 * Search for opponent in queue
 */
async function searchForOpponent(matchType, userRankPoints) {
    console.log('[Matchmaking] Actively searching for opponent');
    
    const searchInterval = setInterval(async () => {
        if (!matchmakingState.isActive) {
            clearInterval(searchInterval);
            return;
        }
        
        try {
            const opponent = await findMatchOpponent(
                matchmakingState.currentUserId, 
                matchType,
                userRankPoints
            );
            
            if (opponent) {
                console.log('[Matchmaking] Opponent found:', opponent);
                clearInterval(searchInterval);
                clearInterval(matchmakingState.searchTimer);
                
                // Create match
                const matchId = await createMatch(
                    matchmakingState.currentUserId,
                    opponent.userId,
                    matchType,
                    matchmakingState.queueId,
                    opponent.queueId
                );
                
                console.log('[Matchmaking] Match created:', matchId);
                matchmakingState.currentMatchId = matchId;
                
                await handleMatchFound(matchId, matchType);
            }
        } catch (error) {
            console.error('[Matchmaking] Error searching for opponent:', error);
        }
    }, 2000); // Check every 2 seconds
    
    // Store interval for cleanup
    matchmakingState.matchListener = searchInterval;
}

/**
 * Handle match found
 */
async function handleMatchFound(matchId, matchType) {
    console.log('[Matchmaking] Handling match found:', matchId);
    
    try {
        // Listen to match state
        matchmakingState.matchStateListener = listenToMatchState(matchId, async (matchState) => {
            console.log('[Matchmaking] Match state updated:', matchState);
            
            if (matchState.status === 'ready') {
                // Both players ready, start match
                cleanupMatchmakingState();
                await startRealTimeMatch(matchId, matchType, matchState);
            }
        });
        
        // Set ourselves as ready
        await setPlayerReady(matchId, matchmakingState.currentUserId);
        
        showMatchFoundUI(matchId);
    } catch (error) {
        console.error('[Matchmaking] Error handling match found:', error);
        cancelMatchmaking();
    }
}

/**
 * Fallback to AI opponent
 */
async function fallbackToAI(matchType) {
    console.log('[Matchmaking] Falling back to AI opponent');
    
    try {
        // Leave queue
        if (matchmakingState.queueId) {
            await leaveMatchmakingQueue(matchmakingState.queueId);
        }
        
        cleanupMatchmakingState();
        
        // Get user's rank for AI scaling
        let rankPoints = 0;
        if (matchType === 'ranked') {
            rankPoints = await getRankPoints(matchmakingState.currentUserId);
        }
        
        // Start match with AI
        const success = await initializeMatch(matchType, {
            isAI: true,
            rankPoints: rankPoints
        });
        
        if (success) {
            showAIMatchStartingUI();
        } else {
            window.showToast('Failed to start AI match.', 'error');
        }
    } catch (error) {
        console.error('[Matchmaking] Error falling back to AI:', error);
        window.showToast('Failed to start AI match.', 'error');
    }
}

/**
 * Start real-time match
 */
async function startRealTimeMatch(matchId, matchType, matchState) {
    console.log('[Matchmaking] Starting real-time match:', matchId);
    
    try {
        // Determine which player we are
        const playerNum = matchState.player1.userId === matchmakingState.currentUserId ? 'player1' : 'player2';
        matchmakingState.playerNum = playerNum;
        
        // Get opponent data
        const opponentData = playerNum === 'player1' ? matchState.player2 : matchState.player1;
        
        // Initialize match with real opponent
        const success = await initializeMatch(matchType, {
            isRealTime: true,
            matchId: matchId,
            playerNum: playerNum,
            opponentId: opponentData.userId,
            opponentSquad: opponentData.squad,
            opponentName: opponentData.clubName
        });
        
        if (!success) {
            console.error('[Matchmaking] Failed to initialize real-time match');
            cancelMatchmaking();
        }
    } catch (error) {
        console.error('[Matchmaking] Error starting real-time match:', error);
        cancelMatchmaking();
    }
}

/* ==========================================================================
   FRIEND MODE
   ========================================================================== */

/**
 * Show friend mode options (create/join room)
 */
function showFriendModeOptions() {
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingScreen || !matchmakingOptions) return;
    
    matchmakingOptions.classList.remove('hidden');
    matchmakingOptions.innerHTML = `
        <div class="friend-mode-container">
            <h2 class="text-gold">Friend Match</h2>
            <p class="text-muted mb-4">Play with a friend using a room code</p>
            
            <div class="friend-mode-cards">
                <div class="friend-card" id="create-room-card">
                    <div class="friend-card-icon">
                        <i class="fa-solid fa-plus"></i>
                    </div>
                    <h3>Create Room</h3>
                    <p class="text-muted">Generate a room code and share it with your friend</p>
                    <button class="btn btn-primary btn-lg" id="create-room-btn">
                        <i class="fa-solid fa-plus"></i> Create Room
                    </button>
                </div>
                
                <div class="friend-card" id="join-room-card">
                    <div class="friend-card-icon">
                        <i class="fa-solid fa-right-to-bracket"></i>
                    </div>
                    <h3>Join Room</h3>
                    <p class="text-muted">Enter a room code to join your friend's match</p>
                    <div class="join-room-input">
                        <input type="text" id="room-code-input" placeholder="Enter 6-digit code" maxlength="6" class="search-input text-center" style="text-transform: uppercase; font-size: 1.5rem; letter-spacing: 0.5rem;">
                        <button class="btn btn-primary btn-lg" id="join-room-btn">
                            <i class="fa-solid fa-right-to-bracket"></i> Join Room
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Bind events
    document.getElementById('create-room-btn').addEventListener('click', createFriendRoom);
    document.getElementById('join-room-btn').addEventListener('click', joinFriendRoom);
}

/**
 * Create friend room
 */
async function createFriendRoom() {
    console.log('[Matchmaking] Creating friend room');
    
    const currentUser = window.currentUser;
    if (!currentUser) {
        window.showToast('You must be logged in.', 'error');
        return;
    }
    
    try {
        // Get user's squad data
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
        
        // Generate room code
        const roomCode = generateRoomCode();
        
        // Create lobby
        const lobbyId = await createLobby(
            currentUser.uid,
            window.userProfile?.profile?.clubName || 'Unknown',
            fullUserSquad,
            roomCode
        );
        
        matchmakingState.isActive = true;
        matchmakingState.matchType = 'friend';
        matchmakingState.currentLobbyId = lobbyId;
        matchmakingState.roomCode = roomCode;
        matchmakingState.isHost = true;
        matchmakingState.currentUserId = currentUser.uid;
        
        // Show room code and wait for player
        showRoomCodeWaitingUI(roomCode);
        
        // Listen for lobby changes
        matchmakingState.lobbyListener = listenToLobby(lobbyId, async (lobby) => {
            console.log('[Matchmaking] Lobby updated:', lobby);
            
            if (lobby.status === 'full' && lobby.players.player2) {
                // Player joined, start match
                console.log('[Matchmaking] Player joined, starting match');
                matchmakingState.lobbyListener();
                
                await startFriendMatch(lobby, true);
            }
        });
        
    } catch (error) {
        console.error('[Matchmaking] Error creating friend room:', error);
        window.showToast('Failed to create room.', 'error');
    }
}

/**
 * Join friend room
 */
async function joinFriendRoom() {
    console.log('[Matchmaking] Joining friend room');
    
    const roomCodeInput = document.getElementById('room-code-input');
    const roomCode = roomCodeInput.value.toUpperCase().trim();
    
    if (roomCode.length !== 6) {
        window.showToast('Please enter a valid 6-digit room code.', 'error');
        return;
    }
    
    const currentUser = window.currentUser;
    if (!currentUser) {
        window.showToast('You must be logged in.', 'error');
        return;
    }
    
    try {
        // Get user's squad data
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
        
        // Join lobby by room code
        const lobby = await joinLobbyByRoomCode(
            roomCode,
            currentUser.uid,
            window.userProfile?.profile?.clubName || 'Unknown',
            fullUserSquad
        );
        
        if (!lobby) {
            window.showToast('Room not found or full.', 'error');
            return;
        }
        
        matchmakingState.isActive = true;
        matchmakingState.matchType = 'friend';
        matchmakingState.currentLobbyId = lobby.lobbyId;
        matchmakingState.roomCode = roomCode;
        matchmakingState.isHost = false;
        matchmakingState.currentUserId = currentUser.uid;
        
        // Show waiting for host to start
        showWaitingForHostUI();
        
        // Listen for lobby changes
        matchmakingState.lobbyListener = listenToLobby(lobby.lobbyId, async (updatedLobby) => {
            console.log('[Matchmaking] Lobby updated:', updatedLobby);
            
            if (updatedLobby.status === 'in_progress') {
                // Match started by host
                console.log('[Matchmaking] Match started by host');
                matchmakingState.lobbyListener();
                
                await startFriendMatch(updatedLobby, false);
            }
        });
        
    } catch (error) {
        console.error('[Matchmaking] Error joining friend room:', error);
        window.showToast('Failed to join room.', 'error');
    }
}

/**
 * Start friend match
 */
async function startFriendMatch(lobby, isHost) {
    console.log('[Matchmaking] Starting friend match');
    
    try {
        // Update lobby status
        const lobbyRef = ref(db, `lobbies/${lobby.lobbyId}`);
        await update(lobbyRef, { status: 'in_progress' });
        
        // Determine player positions
        const playerNum = isHost ? 'player1' : 'player2';
        const opponentData = isHost ? lobby.players.player2 : lobby.players.host;
        
        // Create Firebase match
        const matchId = await createMatch(
            lobby.hostId,
            opponentData.userId,
            'friend',
            null,
            null
        );
        
        // Initialize match
        const success = await initializeMatch('friend', {
            isRealTime: true,
            matchId: matchId,
            playerNum: playerNum,
            opponentId: opponentData.userId,
            opponentSquad: opponentData.squad,
            opponentName: opponentData.clubName
        });
        
        if (!success) {
            console.error('[Matchmaking] Failed to initialize friend match');
            cancelMatchmaking();
        }
        
        cleanupMatchmakingState();
        
    } catch (error) {
        console.error('[Matchmaking] Error starting friend match:', error);
        cancelMatchmaking();
    }
}

/* ==========================================================================
   UI FUNCTIONS
   ========================================================================== */

/**
 * Show searching UI
 */
function showSearchingUI(matchType) {
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingScreen || !matchmakingOptions) return;
    
    matchmakingOptions.classList.remove('hidden');
    matchmakingOptions.innerHTML = `
        <div class="searching-container">
            <div class="searching-animation">
                <i class="fa-solid fa-futbol fa-spin"></i>
            </div>
            <h2 class="text-gold">${matchType === 'ranked' ? 'Ranked' : 'Unranked'} Match</h2>
            <p id="search-timer" class="text-muted">Searching for opponent... ${MATCHMAKING_CONFIG.SEARCH_DURATION}s</p>
            <button class="btn btn-outline" id="cancel-search-btn">
                <i class="fa-solid fa-xmark"></i> Cancel
            </button>
        </div>
    `;
    
    document.getElementById('cancel-search-btn').addEventListener('click', cancelMatchmaking);
}

/**
 * Show match found UI
 */
function showMatchFoundUI(matchId) {
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingOptions) return;
    
    matchmakingOptions.innerHTML = `
        <div class="match-found-container">
            <div class="match-found-animation">
                <i class="fa-solid fa-trophy text-gold"></i>
            </div>
            <h2 class="text-gold">Match Found!</h2>
            <p class="text-muted">Preparing match session...</p>
            <div class="loading-spinner"></div>
        </div>
    `;
}

/**
 * Show AI match starting UI
 */
function showAIMatchStartingUI() {
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingOptions) return;
    
    matchmakingOptions.innerHTML = `
        <div class="ai-match-container">
            <div class="ai-match-animation">
                <i class="fa-solid fa-robot text-gold"></i>
            </div>
            <h2 class="text-gold">AI Opponent</h2>
            <p class="text-muted">No online opponent found. Playing against AI.</p>
            <div class="loading-spinner"></div>
        </div>
    `;
}

/**
 * Show room code waiting UI
 */
function showRoomCodeWaitingUI(roomCode) {
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingOptions) return;
    
    matchmakingOptions.innerHTML = `
        <div class="room-code-container">
            <h2 class="text-gold">Room Created</h2>
            <p class="text-muted mb-4">Share this code with your friend:</p>
            <div class="room-code-display">
                <span class="room-code">${roomCode}</span>
                <button class="btn btn-outline" id="copy-code-btn">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
            <p class="text-muted mt-4">Waiting for player to join...</p>
            <div class="loading-spinner"></div>
            <button class="btn btn-outline mt-4" id="cancel-room-btn">
                <i class="fa-solid fa-xmark"></i> Cancel
            </button>
        </div>
    `;
    
    document.getElementById('copy-code-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(roomCode);
        window.showToast('Room code copied!', 'success');
    });
    
    document.getElementById('cancel-room-btn').addEventListener('click', cancelMatchmaking);
}

/**
 * Show waiting for host UI
 */
function showWaitingForHostUI() {
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingOptions) return;
    
    matchmakingOptions.innerHTML = `
        <div class="waiting-host-container">
            <div class="waiting-animation">
                <i class="fa-solid fa-hourglass-half text-gold"></i>
            </div>
            <h2 class="text-gold">Waiting for Host</h2>
            <p class="text-muted">The host will start the match soon...</p>
            <div class="loading-spinner"></div>
            <button class="btn btn-outline mt-4" id="cancel-join-btn">
                <i class="fa-solid fa-xmark"></i> Cancel
            </button>
        </div>
    `;
    
    document.getElementById('cancel-join-btn').addEventListener('click', cancelMatchmaking);
}

/**
 * Show matchmaking cooldown UI
 */
function showMatchmakingCooldown(cooldownEnd) {
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingOptions) return;
    
    const remainingMs = cooldownEnd - Date.now();
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    
    matchmakingOptions.classList.remove('hidden');
    matchmakingOptions.innerHTML = `
        <div class="cooldown-container">
            <div class="cooldown-animation">
                <i class="fa-solid fa-clock text-gold"></i>
            </div>
            <h2 class="text-gold">Match Cooldown</h2>
            <p class="text-muted">You can play again in:</p>
            <div class="cooldown-timer">${formatCooldownTime(remainingSeconds)}</div>
        </div>
    `;
    
    // Update timer every second
    const cooldownInterval = setInterval(() => {
        const remaining = cooldownEnd - Date.now();
        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            matchmakingOptions.innerHTML = ''; // Clear and show normal options
            initPlayMenu();
        } else {
            const timerElement = document.querySelector('.cooldown-timer');
            if (timerElement) {
                timerElement.textContent = formatCooldownTime(Math.ceil(remaining / 1000));
            }
        }
    }, 1000);
}

/**
 * Format cooldown time
 */
function formatCooldownTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/* ==========================================================================
   CLEANUP FUNCTIONS
   ========================================================================== */

/**
 * Cancel matchmaking
 */
export async function cancelMatchmaking() {
    console.log('[Matchmaking] Cancelling matchmaking');
    
    try {
        // Leave queue if in one
        if (matchmakingState.queueId) {
            await leaveMatchmakingQueue(matchmakingState.queueId);
        }
        
        // Delete lobby if host
        if (matchmakingState.isHost && matchmakingState.currentLobbyId) {
            await deleteLobby(matchmakingState.currentLobbyId);
        }
        
        cleanupMatchmakingState();
        
        // Return to play menu
        initPlayMenu();
    } catch (error) {
        console.error('[Matchmaking] Error cancelling matchmaking:', error);
        cleanupMatchmakingState();
        initPlayMenu();
    }
}

/**
 * Cleanup matchmaking state
 */
function cleanupMatchmakingState() {
    if (matchmakingState.searchTimer) {
        clearInterval(matchmakingState.searchTimer);
    }
    if (matchmakingState.friendCheckInterval) {
        clearInterval(matchmakingState.friendCheckInterval);
    }
    if (matchmakingState.matchListener) {
        clearInterval(matchmakingState.matchListener);
    }
    if (matchmakingState.keepAliveInterval) {
        clearInterval(matchmakingState.keepAliveInterval);
    }
    if (matchmakingState.queueListener && typeof matchmakingState.queueListener === 'function') {
        matchmakingState.queueListener();
    }
    if (matchmakingState.matchStateListener && typeof matchmakingState.matchStateListener === 'function') {
        matchmakingState.matchStateListener();
    }
    if (matchmakingState.lobbyListener && typeof matchmakingState.lobbyListener === 'function') {
        matchmakingState.lobbyListener();
    }
    
    matchmakingState = {
        isActive: false,
        matchType: null,
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
        playerNum: null,
        currentLobbyId: null,
        lobbyListener: null,
        roomCode: null,
        isHost: false
    };
}

/**
 * Check for existing queue on page load
 */
export async function checkExistingQueue() {
    const currentUser = window.currentUser;
    if (!currentUser) return;
    
    try {
        // Check if user is in any queue
        const queueData = await getMatchmakingQueue(currentUser.uid);
        if (queueData) {
            console.log('[Matchmaking] Found existing queue:', queueData);
            // Could restore matchmaking state here if needed
        }
    } catch (error) {
        console.error('[Matchmaking] Error checking existing queue:', error);
    }
}

/* ==========================================================================
   PLAY MENU INITIALIZATION
   ========================================================================== */

/**
 * Initialize play menu with 3 mode cards
 */
export function initPlayMenu() {
    const matchmakingOptions = document.getElementById('matchmaking-options');
    
    if (!matchmakingOptions) return;
    
    matchmakingOptions.classList.remove('hidden');
    
    // Get user rank info
    const rankPoints = window.userProfile?.rankPoints || 0;
    const currentRank = getRankFromPoints(rankPoints);
    const pointsToNext = getPointsToNextRank(rankPoints);
    
    matchmakingOptions.innerHTML = `
        <div class="play-menu-container">
            <div class="rank-display">
                <div class="rank-badge ${getRankClass(currentRank)}">
                    <i class="fa-solid fa-shield"></i>
                    <span class="rank-name">${currentRank}</span>
                </div>
                <div class="rank-progress">
                    <span class="rank-points">${rankPoints}/999 PTS</span>
                    ${pointsToNext > 0 ? `<span class="rank-next">${pointsToNext} to ${getRankFromPoints(rankPoints + pointsToNext)}</span>` : '<span class="rank-next max-rank">MAX RANK</span>'}
                </div>
            </div>
            
            <div class="play-modes-grid">
                <!-- Ranked Mode Card -->
                <div class="play-mode-card ranked-card" data-mode="ranked">
                    <div class="mode-icon ranked-icon">
                        <i class="fa-solid fa-trophy"></i>
                    </div>
                    <div class="mode-content">
                        <h3>Ranked</h3>
                        <p class="mode-description">Compete for rank points and climb the ladder</p>
                        <div class="mode-stats">
                            <span class="stat"><i class="fa-solid fa-star"></i> Rank Points</span>
                            <span class="stat"><i class="fa-solid fa-chart-line"></i> Ladder</span>
                        </div>
                    </div>
                    <button class="btn btn-primary mode-btn ranked-btn">
                        <i class="fa-solid fa-play"></i> Play Ranked
                    </button>
                </div>
                
                <!-- Unranked Mode Card -->
                <div class="play-mode-card unranked-card" data-mode="unranked">
                    <div class="mode-icon unranked-icon">
                        <i class="fa-solid fa-futbol"></i>
                    </div>
                    <div class="mode-content">
                        <h3>Unranked</h3>
                        <p class="mode-description">Practice and play without affecting your rank</p>
                        <div class="mode-stats">
                            <span class="stat"><i class="fa-solid fa-coins"></i> Coins</span>
                            <span class="stat"><i class="fa-solid fa-flask"></i> Practice</span>
                        </div>
                    </div>
                    <button class="btn btn-primary mode-btn unranked-btn">
                        <i class="fa-solid fa-play"></i> Play Unranked
                    </button>
                </div>
                
                <!-- Friend Mode Card -->
                <div class="play-mode-card friend-card" data-mode="friend">
                    <div class="mode-icon friend-icon">
                        <i class="fa-solid fa-user-group"></i>
                    </div>
                    <div class="mode-content">
                        <h3>Friend</h3>
                        <p class="mode-description">Play with friends using room codes</p>
                        <div class="mode-stats">
                            <span class="stat"><i class="fa-solid fa-code"></i> Room Codes</span>
                            <span class="stat"><i class="fa-solid fa-users"></i> Private</span>
                        </div>
                    </div>
                    <button class="btn btn-primary mode-btn friend-btn">
                        <i class="fa-solid fa-play"></i> Play Friend
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Bind events
    document.querySelectorAll('.play-mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            startMatchmaking(mode);
        });
    });
}

/**
 * Get rank CSS class
 */
function getRankClass(rank) {
    const rankMap = {
        'Amateur': 'rank-amateur',
        'Semi-Pro': 'rank-semipro',
        'Professional': 'rank-professional',
        'World Class': 'rank-worldclass',
        'Elite': 'rank-elite',
        'Legendary': 'rank-legendary',
        'Champion': 'rank-champion',
        'Ultimate': 'rank-ultimate',
        'Mythic': 'rank-mythic',
        'ZA Champion': 'rank-zachampion'
    };
    return rankMap[rank] || 'rank-amateur';
}

// Export functions for use in app.js
export { initPlayMenu, startMatchmaking, cancelMatchmaking, checkExistingQueue };
