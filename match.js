/* ==========================================================================
   MATCH ENGINE - COMPLETE REDESIGN
   2-minute real-time matches, ball-only field, stat-based simulation
   ========================================================================== */

import { getUserProfile, updateData, updateMatchState, addMatchEvent, addMatchGoal, switchTurn, completeMatch, deleteMatchState, listenToMatchState, updateRankPoints, setMatchCooldown } from './database.js';
import { db } from './firebase.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getRankTier } from './utils.js';

// Database paths
const PATHS = {
    USERS: 'users'
};

// Match Configuration
const MATCH_CONFIG = {
    REAL_DURATION: 120, // 2 minutes in seconds
    GAME_DURATION: 90, // 90 in-game minutes
    TICK_RATE: 100, // Update every 100ms for smooth clock
    COOLDOWN_DURATION: 4 * 60 * 1000, // 4 minutes cooldown
    EVENT_INTERVAL: 5000, // Check for events every 5 seconds
    QUIET_PERIOD_CHANCE: 0.1, // 10% chance of quiet period (reduced from 30%)
    MOMENTUM_FACTOR: 0.15, // How much momentum affects play
    ATTACK_DURATION: 3000, // How long an attack banner shows
    GOAL_CELEBRATION_DURATION: 4000, // How long goal celebration shows
    PENALTY_DURATION: 5000, // How long penalty UI shows
    SHOT_SELECTION_DURATION: 3000 // How long shot selection UI shows
};

// Match State
let matchState = {
    isRunning: false,
    currentTime: 0, // In-game minutes
    realStartTime: null,
    totalPausedTime: 0, // Track total time spent paused
    pauseStartTime: null, // When pause started
    homeTeam: null,
    awayTeam: null,
    homeScore: 0,
    awayScore: 0,
    possession: 'home', // 'home' or 'away'
    ballPosition: { x: 50, y: 50 }, // Percentage position
    ballVelocity: { x: 0, y: 0 },
    homePossessionTime: 0,
    awayPossessionTime: 0,
    homeShots: 0,
    awayShots: 0,
    homeShotsOnTarget: 0,
    awayShotsOnTarget: 0,
    homePasses: 0,
    awayPasses: 0,
    homePassesCompleted: 0,
    awayPassesCompleted: 0,
    homeCorners: 0,
    awayCorners: 0,
    homeFouls: 0,
    awayFouls: 0,
    homeYellowCards: 0,
    awayYellowCards: 0,
    homeRedCards: 0,
    awayRedCards: 0,
    homeXG: 0,
    awayXG: 0,
    momentum: 0, // -1 to 1, negative = away advantage, positive = home advantage
    goals: [],
    assists: [],
    commentary: [],
    currentEvent: null,
    eventTimer: null,
    matchInterval: null,
    eventInterval: null,
    isRanked: false,
    isRealOpponent: false,
    opponentId: null,
    isPaused: false, // For shot selection and penalties
    currentShooter: null,
    penaltyTeam: null
};

// AI Opponent Data (rank-scaled - 10 tiers)
const AI_TEAMS_BY_RANK = {
    // Tier 0-2: Amateur, Semi-Pro, Professional (Low ranks)
    0: { name: 'Amateur FC', rating: 55, attack: 52, defense: 50, midfield: 54, aggression: 40, chemistry: 45, decisionMaking: 40, reactionTime: 0.8 },
    1: { name: 'Beginner United', rating: 60, attack: 56, defense: 54, midfield: 58, aggression: 45, chemistry: 50, decisionMaking: 45, reactionTime: 0.75 },
    2: { name: 'Rookie Town', rating: 65, attack: 60, defense: 58, midfield: 62, aggression: 50, chemistry: 55, decisionMaking: 50, reactionTime: 0.7 },
    
    // Tier 3-5: World Class, Elite, Legendary (Medium ranks)
    3: { name: 'Novice City', rating: 70, attack: 66, defense: 64, midfield: 68, aggression: 55, chemistry: 60, decisionMaking: 55, reactionTime: 0.65 },
    4: { name: 'Starter FC', rating: 75, attack: 72, defense: 70, midfield: 74, aggression: 60, chemistry: 65, decisionMaking: 60, reactionTime: 0.6 },
    5: { name: 'Practice XI', rating: 80, attack: 78, defense: 76, midfield: 79, aggression: 65, chemistry: 70, decisionMaking: 65, reactionTime: 0.55 },
    
    // Tier 6-8: Champion, Ultimate, Mythic (High ranks)
    6: { name: 'Training Ground', rating: 85, attack: 84, defense: 82, midfield: 84, aggression: 70, chemistry: 75, decisionMaking: 70, reactionTime: 0.5 },
    7: { name: 'Elite Academy', rating: 90, attack: 90, defense: 88, midfield: 89, aggression: 75, chemistry: 80, decisionMaking: 75, reactionTime: 0.45 },
    8: { name: 'Champion XI', rating: 93, attack: 92, defense: 91, midfield: 92, aggression: 80, chemistry: 85, decisionMaking: 80, reactionTime: 0.4 },
    
    // Tier 9: ZA Champion (Max rank)
    9: { name: 'ZA Champion Team', rating: 96, attack: 95, defense: 94, midfield: 95, aggression: 85, chemistry: 90, decisionMaking: 85, reactionTime: 0.35 }
};

/**
 * Initialize a new match
 */
export async function initializeMatch(matchType = 'unranked', opponent = null) {
    try {
        // Check cooldown
        const cooldownEnd = localStorage.getItem('matchCooldownEnd');
        if (cooldownEnd && Date.now() < parseInt(cooldownEnd)) {
            showCooldownScreen(parseInt(cooldownEnd));
            return false;
        }

        const currentUser = window.currentUser;
        if (!currentUser) {
            console.error('[Match Engine] No current user found');
            return false;
        }

        const userProfile = await getUserProfile(currentUser.uid);
        if (!userProfile || !userProfile.squad || !userProfile.squad.starters) {
            window.showToast('You need to set up your squad before playing!', 'error');
            return false;
        }

        // Convert squad starters (instanceId format) to actual player data
        const startersWithPlayerData = {};
        Object.entries(userProfile.squad.starters).forEach(([key, starter]) => {
            const instanceId = starter.instanceId;
            if (instanceId && userProfile.club && userProfile.club[instanceId]) {
                startersWithPlayerData[key] = userProfile.club[instanceId];
            }
        });

        if (Object.keys(startersWithPlayerData).length < 11) {
            window.showToast('You need at least 11 players in your squad!', 'error');
            return false;
        }

        // Generate teams
        matchState.homeTeam = generateTeamFromSquad(startersWithPlayerData, userProfile.profile?.clubName || 'My Club');
        
        if (opponent && opponent.isRealTime) {
            // Real-time multiplayer match
            return initializeRealTimeMatch(opponent);
        }
        
        if (opponent && opponent.opponentSquad) {
            // Real opponent - use their squad data
            const opponentStartersWithPlayerData = {};
            Object.entries(opponent.opponentSquad.starters || {}).forEach(([key, starter]) => {
                const instanceId = starter.instanceId;
                if (instanceId && opponent.opponentSquad.starters[key]) {
                    opponentStartersWithPlayerData[key] = opponent.opponentSquad.starters[key];
                }
            });
            
            matchState.awayTeam = generateTeamFromSquad(
                opponentStartersWithPlayerData, 
                opponent.opponentSquad.name || opponent.opponentSquad.formation || 'Opponent'
            );
            matchState.isRealOpponent = true;
            matchState.opponentId = opponent.opponentId;
        } else {
            // Select AI team based on user's rank for scaled difficulty
            const userRankPoints = opponent?.rankPoints || 0;
            const userRankTier = getRankTier(userRankPoints);
            
            // Get AI template for this rank tier
            let aiTemplate = AI_TEAMS_BY_RANK[userRankTier] || AI_TEAMS_BY_RANK[0];
            
            // Add some variance within the same tier (±5 rating)
            const variance = Math.floor(Math.random() * 10) - 5;
            aiTemplate = {
                ...aiTemplate,
                rating: Math.max(50, Math.min(99, aiTemplate.rating + variance))
            };
            
            console.log(`[Match Engine] AI opponent for rank tier ${userRankTier}:`, aiTemplate);
            
            matchState.awayTeam = generateAITeam(aiTemplate);
            matchState.isRealOpponent = false;
            matchState.opponentId = null;
            matchState.aiRankTier = userRankTier;
        }

        matchState.isRanked = matchType === 'ranked';

        // Reset match state
        resetMatchState();

        // Show squad preview
        showSquadPreview();

        return true;
    } catch (error) {
        console.error('[Match Engine] Failed to initialize match:', error);
        window.showToast('Failed to start match. Please try again.', 'error');
        return false;
    }
}

/**
 * Generate team from user's squad
 */
function generateTeamFromSquad(starters, clubName) {
    const players = [];
    let totalRating = 0;
    let totalAttack = 0;
    let totalDefense = 0;
    let totalMidfield = 0;
    let totalChemistry = 0;

    Object.values(starters).forEach(starter => {
        if (starter && starter.rating) {
            players.push({
                ...starter,
                currentStamina: 100,
                form: 80 + Math.random() * 20
            });
            totalRating += starter.rating;
            totalAttack += starter.shooting || starter.pace || 70;
            totalDefense += starter.defending || starter.physical || 70;
            totalMidfield += starter.passing || starter.dribbling || 70;
            totalChemistry += 85; // Base chemistry
        }
    });

    const playerCount = players.length || 1;
    return {
        name: clubName,
        players: players,
        rating: Math.round(totalRating / playerCount),
        attack: Math.round(totalAttack / playerCount),
        defense: Math.round(totalDefense / playerCount),
        midfield: Math.round(totalMidfield / playerCount),
        chemistry: Math.round(totalChemistry / playerCount),
        isUser: true
    };
}

/**
 * Generate AI team
 */
function generateAITeam(aiTemplate) {
    const players = [];
    const positions = ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CAM', 'RW', 'ST', 'LW'];
    
    positions.forEach((pos, index) => {
        const ratingVar = Math.floor(Math.random() * 10) - 5;
        const baseRating = aiTemplate.rating + ratingVar;
        const player = {
            id: 'ai_' + index,
            name: generateAIPlayerName(pos),
            rating: Math.max(60, Math.min(99, baseRating)),
            position: pos,
            pace: baseRating + Math.floor(Math.random() * 15) - 7,
            shooting: baseRating + Math.floor(Math.random() * 15) - 7,
            passing: baseRating + Math.floor(Math.random() * 15) - 7,
            dribbling: baseRating + Math.floor(Math.random() * 15) - 7,
            defending: baseRating + Math.floor(Math.random() * 15) - 7,
            physical: baseRating + Math.floor(Math.random() * 15) - 7,
            currentStamina: 100,
            form: 80 + Math.random() * 20
        };
        players.push(player);
    });

    return {
        name: aiTemplate.name,
        players: players,
        rating: aiTemplate.rating,
        attack: aiTemplate.attack,
        defense: aiTemplate.defense,
        midfield: aiTemplate.midfield,
        chemistry: aiTemplate.chemistry,
        isUser: false
    };
}

/**
 * Generate random AI player name
 */
function generateAIPlayerName(position) {
    const firstNames = ['Carlos', 'Marco', 'Luis', 'Andre', 'Paulo', 'Rafael', 'Bruno', 'Diego', 'Lucas', 'Gabriel'];
    const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Almeida', 'Costa', 'Pereira', 'Carvalho'];
    return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)];
}

/**
 * Reset match state
 */
function resetMatchState() {
    matchState.currentTime = 0;
    matchState.realStartTime = null;
    matchState.totalPausedTime = 0;
    matchState.pauseStartTime = null;
    matchState.homeScore = 0;
    matchState.awayScore = 0;
    matchState.possession = 'home';
    matchState.ballPosition = { x: 50, y: 50 };
    matchState.ballVelocity = { x: 0, y: 0 };
    matchState.homePossessionTime = 0;
    matchState.awayPossessionTime = 0;
    matchState.homeShots = 0;
    matchState.awayShots = 0;
    matchState.homeShotsOnTarget = 0;
    matchState.awayShotsOnTarget = 0;
    matchState.homePasses = 0;
    matchState.awayPasses = 0;
    matchState.homePassesCompleted = 0;
    matchState.awayPassesCompleted = 0;
    matchState.homeCorners = 0;
    matchState.awayCorners = 0;
    matchState.homeFouls = 0;
    matchState.awayFouls = 0;
    matchState.homeYellowCards = 0;
    matchState.awayYellowCards = 0;
    matchState.homeRedCards = 0;
    matchState.awayRedCards = 0;
    matchState.homeXG = 0;
    matchState.awayXG = 0;
    matchState.momentum = 0;
    matchState.goals = [];
    matchState.assists = [];
    matchState.commentary = [];
    matchState.currentEvent = null;
    matchState.isRunning = false;
    matchState.isPaused = false;
    matchState.currentShooter = null;
    matchState.penaltyTeam = null;
    matchState.isRealTime = false;
    matchState.sharedMatchId = null;
    matchState.playerNum = null;
}

/**
 * Initialize real-time multiplayer match
 */
async function initializeRealTimeMatch(sharedMatchState) {
    console.log('[Match Engine] Initializing real-time match with shared state:', sharedMatchState);
    
    if (!sharedMatchState) {
        console.error('[Match Engine] No shared match state found');
        return false;
    }
    
    // Determine which player we are
    const currentUser = window.currentUser;
    const playerNum = sharedMatchState.player1.userId === currentUser.uid ? 'player1' : 'player2';
    
    // Set real-time flags
    matchState.isRealTime = true;
    matchState.sharedMatchId = sharedMatchState.matchId;
    matchState.playerNum = playerNum;
    matchState.opponentId = playerNum === 'player1' ? sharedMatchState.player2.userId : sharedMatchState.player1.userId;
    
    // Determine which team is home/away based on player number
    const mySquad = playerNum === 'player1' ? sharedMatchState.player1.squad : sharedMatchState.player2.squad;
    const opponentSquad = playerNum === 'player1' ? sharedMatchState.player2.squad : sharedMatchState.player1.squad;
    
    // Convert squad data to teams
    const myStartersWithPlayerData = {};
    Object.entries(mySquad.starters || {}).forEach(([key, starter]) => {
        if (starter.name) {
            myStartersWithPlayerData[key] = starter;
        }
    });
    
    const opponentStartersWithPlayerData = {};
    Object.entries(opponentSquad.starters || {}).forEach(([key, starter]) => {
        if (starter.name) {
            opponentStartersWithPlayerData[key] = starter;
        }
    });
    
    const myClubName = playerNum === 'player1' ? sharedMatchState.player1.clubName : sharedMatchState.player2.clubName;
    const opponentClubName = playerNum === 'player1' ? sharedMatchState.player2.clubName : sharedMatchState.player1.clubName;
    
    matchState.homeTeam = generateTeamFromSquad(
        myStartersWithPlayerData, 
        myClubName || 'My Club'
    );
    
    matchState.awayTeam = generateTeamFromSquad(
        opponentStartersWithPlayerData, 
        opponentClubName || 'Opponent'
    );
    
    // Reset match state
    resetMatchState();
    
    // Sync initial state from Firebase
    matchState.homeScore = sharedMatchState.player1.score || 0;
    matchState.awayScore = sharedMatchState.player2.score || 0;
    matchState.currentTime = sharedMatchState.currentMinute || 0;
    matchState.isRanked = sharedMatchState.matchType === 'ranked';
    
    // Set up real-time listener
    const unsubscribe = listenToMatchState(sharedMatchState.matchId, (updatedState) => {
        console.log('[Match Engine] Match state updated:', updatedState);
        
        // Sync scores
        matchState.homeScore = updatedState.player1.score || 0;
        matchState.awayScore = updatedState.player2.score || 0;
        matchState.currentTime = updatedState.currentMinute || 0;
        
        // Process new events
        if (updatedState.events && updatedState.events.length > (matchState.commentary.length || 0)) {
            const newEvents = updatedState.events.slice(matchState.commentary.length || 0);
            newEvents.forEach(event => {
                matchState.commentary.push(event);
                // Add commentary to display
                addCommentaryToDisplay(event.description, event.type);
            });
        }
        
        // Check for new goals
        if (updatedState.goals && updatedState.goals.length > (matchState.goals.length || 0)) {
            const newGoals = updatedState.goals.slice(matchState.goals.length || 0);
            newGoals.forEach(goal => {
                matchState.goals.push(goal);
                // Show goal celebration
                showGoalCelebrationRT(goal);
            });
        }
        
        // Update UI
        updateScoreboard();
        updateMatchTime();
        
        // Check if match is complete
        if (updatedState.status === 'completed') {
            endRealTimeMatch(updatedState);
        }
    });
    
    // Store unsubscribe function for cleanup
    matchState.matchStateUnsubscribe = unsubscribe;
    
    // Show squad preview
    showSquadPreview();
    
    // Wait for match to start (status becomes 'in_progress')
    if (sharedMatchState.status === 'in_progress') {
        startRealTimeGameLoop();
    } else {
        // Show waiting screen
        showWaitingForMatchStart();
    }
    
    return true;
}

/**
 * Show waiting for match start screen
 */
function showWaitingForMatchStart() {
    const matchScreen = document.getElementById('match-screen');
    if (!matchScreen) return;
    
    const waitingHTML = '<div class="waiting-screen" style="text-align: center; padding: 2rem;"><h2>Waiting for Opponent to Ready Up...</h2><div class="loading-spinner" style="margin: 1rem auto;"></div><p class="text-muted">Match will start when both players are ready</p></div>';
    
    // Insert waiting screen
    const existingWaiting = matchScreen.querySelector('.waiting-screen');
    if (existingWaiting) {
        existingWaiting.remove();
    }
    
    matchScreen.insertAdjacentHTML('afterbegin', waitingHTML);
}

/**
 * Start real-time game loop
 */
function startRealTimeGameLoop() {
    console.log('[Match Engine] Starting real-time game loop');
    
    // Remove waiting screen if exists
    const waitingScreen = document.querySelector('.waiting-screen');
    if (waitingScreen) {
        waitingScreen.remove();
    }
    
    // Start the normal match but with real-time synchronization
    matchState.isRunning = true;
    matchState.realStartTime = Date.now();
    
    // Start match intervals
    startMatchIntervals();
    
    // Show match screen
    document.getElementById('match-screen').classList.remove('hidden');
}

/**
 * End real-time match
 */
function endRealTimeMatch(finalState) {
    console.log('[Match Engine] Ending real-time match:', finalState);
    
    // Stop match intervals
    stopMatchIntervals();
    
    // Unsubscribe from match state
    if (matchState.matchStateUnsubscribe) {
        matchState.matchStateUnsubscribe();
        matchState.matchStateUnsubscribe = null;
    }
    
    // Show match results
    showMatchResults(finalState);
}

/**
 * Show goal celebration for real-time match
 */
function showGoalCelebrationRT(goal) {
    const goalBanner = document.getElementById('goal-banner');
    if (!goalBanner) return;
    
    goalBanner.querySelector('.goal-scorer').textContent = goal.scorer;
    goalBanner.querySelector('.goal-assist').textContent = 'Assist: ' + (goal.assist || 'None');
    goalBanner.querySelector('.goal-minute').textContent = goal.minute + "'";
    
    goalBanner.classList.remove('hidden');
    
    setTimeout(() => {
        goalBanner.classList.add('hidden');
    }, MATCH_CONFIG.GOAL_CELEBRATION_DURATION);
}

// Insert waiting screen before field
    const field = matchScreen.querySelector('.match-field');
    if (field) {
        field.insertAdjacentHTML('beforebegin', waitingHTML);
    }
}

/**
 * Start real-time game loop
 */
function startRealTimeGameLoop() {
    console.log('[Match Engine] Starting real-time game loop');
    
    // Remove waiting screen if exists
    const waitingScreen = document.querySelector('.waiting-screen');
    if (waitingScreen) {
        waitingScreen.remove();
    }
    
    // Reset match state
    resetMatchState();
    
    // Start the match loop (simplified for now)
    matchState.isRunning = true;
    matchState.realStartTime = Date.now();
    
    // Start the clock
    startMatchClock();
    
    // Start event generation (simplified)
    startRealTimeEventGeneration();
}

/**
 * Start real-time event generation
 */
function startRealTimeEventGeneration() {
    // This will generate events and sync them to Firebase
    // For now, use the existing event system but sync to Firebase
    
    matchState.eventInterval = setInterval(() => {
        if (!matchState.isRunning || matchState.isPaused) return;
        
        // Only generate events if it's our turn (or if we're home team for simplicity)
        if (matchState.playerNum === 'player1') {
            generateRandomMatchEvent();
        }
    }, 3000); // Check every 3 seconds
}

/**
 * Generate random match event and sync to Firebase
 */
function generateRandomMatchEvent() {
    // Use existing match engine logic to generate events
    const minute = Math.floor(matchState.currentTime / (MATCH_CONFIG.REAL_DURATION / MATCH_CONFIG.GAME_DURATION));
    
    // Generate event based on probabilities
    const rand = Math.random();
    let eventType;
    
    if (rand < 0.05) {
        eventType = 'goal';
    } else if (rand < 0.15) {
        eventType = 'shot';
    } else if (rand < 0.25) {
        eventType = 'foul';
    } else if (rand < 0.30) {
        eventType = 'corner';
    } else {
        eventType = 'pass';
    }
    
    // Generate event description
    const team = Math.random() > 0.5 ? 'home' : 'away';
    const event = {
        type: eventType,
        description: eventType.toUpperCase() + ' - ' + (team === 'home' ? matchState.homeTeam.name : matchState.awayTeam.name),
        minute: minute,
        team: team
    };
    
    // Sync to Firebase
    if (matchState.sharedMatchId) {
        addMatchEvent(matchState.sharedMatchId, event);
        
        // If it's a goal, sync that too
        if (eventType === 'goal') {
            const scoringPlayer = team === 'home' ? 'player1' : 'player2';
            addMatchGoal(matchState.sharedMatchId, scoringPlayer, {
                description: 'Goal by ' + (team === 'home' ? matchState.homeTeam.name : matchState.awayTeam.name) + '!',
                minute: minute
            });
        }
    }
    
    // Also add to local state
    matchState.commentary.push(event);
    addCommentaryToDisplay(event.description, eventType);
    
    // Update local score if goal
    if (eventType === 'goal') {
        if (team === 'home') {
            matchState.homeScore++;
        } else {
            matchState.awayScore++;
        }
        updateScoreboard();
    }
}

/**
 * Add commentary to display
 */
function addCommentaryToDisplay(text, type) {
    const commentaryFeed = document.getElementById('commentary-feed');
    if (!commentaryFeed) return;
    
    const item = document.createElement('div');
    item.className = 'commentary-item';
    item.innerHTML = '<span class="commentary-minute">' + matchState.currentMinute + "'</span> " + text;
    
    commentaryFeed.appendChild(item);
    commentaryFeed.scrollTop = commentaryFeed.scrollHeight;
}

/**
 * Show goal celebration (for real-time multiplayer)
 */
function showGoalCelebrationRT(goal) {
    const goalOverlay = document.getElementById('goal-celebration');
    if (!goalOverlay) return;
    
    goalOverlay.innerHTML = '<div class="goal-celebration"><h2>⚽ GOAL!</h2><p>' + (goal.description || 'Goal scored!') + '</p></div>';
    
    goalOverlay.classList.remove('hidden');
    
    setTimeout(() => {
        goalOverlay.classList.add('hidden');
    }, 3000);
}

/**
 * Start the match
 */
function startMatch() {
    matchState.isRunning = true;
    matchState.realStartTime = Date.now();
    
    addCommentary("Kickoff! The match begins.");
    
    // Start the main match loop
    matchState.matchInterval = setInterval(matchTick, MATCH_CONFIG.TICK_RATE);
    
    // Start event checking
    matchState.eventInterval = setInterval(checkForEvent, MATCH_CONFIG.EVENT_INTERVAL);
}

/**
 * Main match tick - runs every 100ms
 */
function matchTick() {
    if (!matchState.isRunning) return;

    // If paused, track pause time
    if (matchState.isPaused) {
        if (!matchState.pauseStartTime) {
            matchState.pauseStartTime = Date.now();
        }
        return;
    }

    // If we just unpaused, add the pause duration to total paused time
    if (matchState.pauseStartTime) {
        matchState.totalPausedTime += Date.now() - matchState.pauseStartTime;
        matchState.pauseStartTime = null;
    }

    // Calculate elapsed real time (excluding paused time)
    const elapsedReal = Date.now() - matchState.realStartTime - matchState.totalPausedTime;
    
    // Convert to in-game minutes (4 real minutes = 90 game minutes)
    matchState.currentTime = (elapsedReal / (MATCH_CONFIG.REAL_DURATION * 1000)) * MATCH_CONFIG.GAME_DURATION;
    
    // Cap at 90 minutes
    if (matchState.currentTime > MATCH_CONFIG.GAME_DURATION) {
        matchState.currentTime = MATCH_CONFIG.GAME_DURATION;
    }
    
    // Update possession time
    if (matchState.possession === 'home') {
        matchState.homePossessionTime += MATCH_CONFIG.TICK_RATE / 1000;
    } else {
        matchState.awayPossessionTime += MATCH_CONFIG.TICK_RATE / 1000;
    }

    // Update ball position based on possession
    updateBallPosition();

    // Check for half-time
    if (matchState.currentTime >= 45 && matchState.currentTime < 45.1) {
        handleHalfTime();
        return;
    }

    // Check for full-time
    if (matchState.currentTime >= MATCH_CONFIG.GAME_DURATION) {
        handleFullTime();
        return;
    }

    // Update UI
    updateMatchUI();
}

/**
 * Update ball position smoothly
 */
function updateBallPosition() {
    const attackingTeam = matchState.possession === 'home' ? matchState.homeTeam : matchState.awayTeam;
    const direction = matchState.possession === 'home' ? 1 : -1;
    
    // Ball moves toward attacking goal
    const targetX = matchState.possession === 'home' ? 85 : 15;
    const targetY = 50;
    
    // Smooth movement with momentum influence
    const momentumInfluence = matchState.momentum * 10;
    const adjustedTargetX = targetX + momentumInfluence;
    
    // Move ball toward target (increased speed from 0.02 to 0.05)
    const dx = adjustedTargetX - matchState.ballPosition.x;
    const dy = targetY - matchState.ballPosition.y;
    
    matchState.ballPosition.x += dx * 0.05;
    matchState.ballPosition.y += dy * 0.05;
    
    // Add more randomness for natural movement and prevent sticking
    matchState.ballPosition.y += (Math.random() - 0.5) * 1.5;
    
    // Keep ball in bounds
    matchState.ballPosition.x = Math.max(5, Math.min(95, matchState.ballPosition.x));
    matchState.ballPosition.y = Math.max(5, Math.min(95, matchState.ballPosition.y));
    
    // Ensure ball keeps moving even if close to target
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        // Force movement if stuck near target
        matchState.ballPosition.x += (Math.random() - 0.5) * 3;
        matchState.ballPosition.y += (Math.random() - 0.5) * 3;
    }
}

/**
 * Check for match events
 */
function checkForEvent() {
    if (!matchState.isRunning) return;

    // Check for quiet period
    if (Math.random() < MATCH_CONFIG.QUIET_PERIOD_CHANCE) {
        // Quiet period - just possession
        updateMomentum(0.02);
        return;
    }

    // Determine event type
    const event = determineEvent();
    
    if (event) {
        executeEvent(event);
    }
}

/**
 * Determine what event should happen
 */
function determineEvent() {
    const attackingTeam = matchState.possession === 'home' ? matchState.homeTeam : matchState.awayTeam;
    const defendingTeam = matchState.possession === 'home' ? matchState.awayTeam : matchState.homeTeam;
    
    const rand = Math.random();
    
    // Attack chance increases with momentum and team strength
    const attackChance = 0.3 + (matchState.momentum * 0.2) + ((attackingTeam.attack - defendingTeam.defense) / 200);
    
    if (rand < attackChance && isInAttackingThird()) {
        return 'attack';
    }
    
    if (rand < 0.4) return 'pass';
    if (rand < 0.5) return 'through_ball';
    if (rand < 0.6) return 'cross';
    if (rand < 0.7) return 'counter_attack';
    if (rand < 0.8) return 'possession_change';
    if (rand < 0.85) return 'foul';
    if (rand < 0.9) return 'corner';
    if (rand < 0.95) return 'throw_in';
    
    return null; // Quiet moment
}

/**
 * Check if ball is in attacking third
 */
function isInAttackingThird() {
    return matchState.possession === 'home' 
        ? matchState.ballPosition.x > 65 
        : matchState.ballPosition.x < 35;
}

/**
 * Execute a match event
 */
function executeEvent(eventType) {
    const attackingTeam = matchState.possession === 'home' ? matchState.homeTeam : matchState.awayTeam;
    const defendingTeam = matchState.possession === 'home' ? matchState.awayTeam : matchState.homeTeam;
    
    switch (eventType) {
        case 'attack':
            handleAttack(attackingTeam, defendingTeam);
            break;
        case 'pass':
            handlePass(attackingTeam);
            break;
        case 'through_ball':
            handleThroughBall(attackingTeam, defendingTeam);
            break;
        case 'cross':
            handleCross(attackingTeam, defendingTeam);
            break;
        case 'counter_attack':
            handleCounterAttack(attackingTeam, defendingTeam);
            break;
        case 'possession_change':
            handlePossessionChange();
            break;
        case 'foul':
            handleFoul(defendingTeam, attackingTeam);
            break;
        case 'corner':
            handleCorner(attackingTeam);
            break;
        case 'throw_in':
            handleThrowIn(attackingTeam);
            break;
    }
}

/**
 * Handle attack event
 */
function handleAttack(attackingTeam, defendingTeam) {
    showAttackBanner(attackingTeam.name);
    
    // Calculate attack outcome
    const attackStrength = calculateAttackStrength(attackingTeam);
    const defenseStrength = calculateDefenseStrength(defendingTeam);
    const attackSuccess = attackStrength - defenseStrength + (Math.random() - 0.5) * 20;
    
    if (attackSuccess > 10) {
        // Successful attack leads to shot (with user input)
        handleShot(attackingTeam, defendingTeam);
    } else if (attackSuccess > -5) {
        // Attack breaks down
        addCommentary(attackingTeam.name + "'s attack breaks down.");
        handlePossessionChange();
    } else {
        // Attack countered
        addCommentary(defendingTeam.name + ' counters the attack!');
        handlePossessionChange();
        updateMomentum(-0.2);
    }
}

/**
 * Calculate attack strength
 */
function calculateAttackStrength(team) {
    const base = team.attack + team.midfield;
    const chemistryBonus = team.chemistry * 0.5;
    const momentumBonus = matchState.momentum * 10;
    return base + chemistryBonus + momentumBonus;
}

/**
 * Calculate defense strength
 */
function calculateDefenseStrength(team) {
    const base = team.defense + team.midfield;
    const chemistryBonus = team.chemistry * 0.3;
    const momentumPenalty = matchState.momentum * 5;
    return base + chemistryBonus - momentumPenalty;
}

/**
 * Handle pass event
 */
function handlePass(team) {
    const passer = getRandomPlayer(team);
    const passSuccess = calculatePassSuccess(passer);
    const isHome = matchState.possession === 'home';
    
    if (isHome) {
        matchState.homePasses++;
        if (passSuccess) matchState.homePassesCompleted++;
    } else {
        matchState.awayPasses++;
        if (passSuccess) matchState.awayPassesCompleted++;
    }
    
    if (passSuccess) {
        const color = isHome ? 'blue' : 'red';
        addCommentary('Good pass by <span class="' + color + '">' + passer.name + '</span>.');
    } else {
        const color = isHome ? 'blue' : 'red';
        addCommentary('Pass misplaced by <span class="' + color + '">' + passer.name + '</span>.');
        handlePossessionChange();
    }
}

/**
 * Calculate pass success
 */
function calculatePassSuccess(player) {
    const base = 0.7;
    const statBonus = (player.passing / 100) * 0.25;
    const staminaPenalty = ((100 - player.currentStamina) / 100) * 0.1;
    return base + statBonus - staminaPenalty > Math.random();
}

/**
 * Handle through ball
 */
function handleThroughBall(attackingTeam, defendingTeam) {
    const passer = getRandomPlayer(attackingTeam);
    const isHome = matchState.possession === 'home';
    
    if (Math.random() < 0.15) {
        addCommentary('Through ball - OFFSIDE!');
        handlePossessionChange();
        return;
    }
    
    const passSuccess = calculatePassSuccess(passer) * 0.8;
    
    if (passSuccess) {
        const color = isHome ? 'blue' : 'red';
        addCommentary('Dangerous through ball by <span class="' + color + '">' + passer.name + '</span>!');
        updateMomentum(0.1);
    } else {
        addCommentary('Through ball intercepted.');
        handlePossessionChange();
    }
}

/**
 * Handle cross
 */
function handleCross(attackingTeam, defendingTeam) {
    const crosser = getRandomPlayer(attackingTeam);
    const isHome = matchState.possession === 'home';
    const color = isHome ? 'blue' : 'red';
    
    addCommentary('Cross into the box by <span class="' + color + '">' + crosser.name + '</span>.');
    
    // 40% chance of header shot (auto-shot for headers)
    if (Math.random() < 0.4) {
        handleAutoShot(attackingTeam, defendingTeam, true);
    } else {
        // 30% chance of corner
        if (Math.random() < 0.3) {
            handleCorner(attackingTeam);
        } else {
            // Cleared
            addCommentary('Cross cleared by defense.');
            handlePossessionChange();
        }
    }
}

/**
 * Handle counter attack
 */
function handleCounterAttack(attackingTeam, defendingTeam) {
    showAttackBanner(attackingTeam.name + " (Counter)");
    addCommentary('Counter attack by ' + attackingTeam.name + '!');
    updateMomentum(0.15);
    
    // Counter attacks are more likely to result in shots
    if (Math.random() < 0.6) {
        handleShot(attackingTeam, defendingTeam);
    } else {
        handlePossessionChange();
    }
}

/**
 * Handle shot event
 */
function handleShot(attackingTeam, defendingTeam, isHeader = false, isPenalty = false) {
    const shooter = getRandomPlayer(attackingTeam);
    const isHome = matchState.possession === 'home';
    const color = isHome ? 'blue' : 'red';
    
    if (isHome) {
        matchState.homeShots++;
    } else {
        matchState.awayShots++;
    }
    
    // Auto-calculate shot result
    const shotResult = calculateShotResult(shooter, defendingTeam, isHeader);
    
    if (shotResult.onTarget) {
        if (isHome) {
            matchState.homeShotsOnTarget++;
        } else {
            matchState.awayShotsOnTarget++;
        }
        
        // Update xG
        const xG = shotResult.goalChance;
        if (isHome) {
            matchState.homeXG += xG;
        } else {
            matchState.awayXG += xG;
        }
        
        if (shotResult.isGoal) {
            addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>! GOAL!');
            handleGoal(shooter, null);
        } else {
            const goalkeeper = getGoalkeeper(defendingTeam);
            const gkColor = !isHome ? 'blue' : 'red';
            addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>! Saved by <span class="' + gkColor + '">' + goalkeeper.name + '</span>!');
            handlePossessionChange();
        }
    } else {
        addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>! Goes wide!');
        handlePossessionChange();
    }
}

/**
 * Calculate shot result
 */
function calculateShotResult(shooter, defendingTeam, isHeader, isPenalty = false) {
    const distance = calculateDistanceToGoal();
    const goalkeeper = getGoalkeeper(defendingTeam);
    
    // Base chance
    let baseChance = 0.5 - (distance / 150);
    
    // Shooting stat (player quality matters)
    const shootingBonus = (shooter.shooting / 100) * 0.4;
    
    // Header penalty
    const headerPenalty = isHeader ? 0.1 : 0;
    
    // Penalty bonus (higher chance for penalties)
    const penaltyBonus = isPenalty ? 0.3 : 0;
    
    // Goalkeeper (better GK = harder to score)
    const gkPenalty = (goalkeeper.rating / 100) * 0.25;
    
    // Position bonus
    const positionBonus = matchState.possession === 'home' 
        ? (matchState.ballPosition.x / 100) * 0.1
        : ((100 - matchState.ballPosition.x) / 100) * 0.1;
    
    // Form and stamina
    const formBonus = (shooter.form / 100) * 0.05;
    const staminaPenalty = ((100 - shooter.currentStamina) / 100) * 0.08;
    
    const onTargetChance = baseChance + shootingBonus - headerPenalty + penaltyBonus - gkPenalty + positionBonus + formBonus - staminaPenalty;
    const isOnTarget = onTargetChance > Math.random();
    
    let isGoal = false;
    let goalChance = 0;
    
    if (isOnTarget) {
        goalChance = onTargetChance * 0.7; // 70% of on-target shots result in goals
        isGoal = goalChance > Math.random();
    }
    
    return { onTarget: isOnTarget, isGoal: isGoal, goalChance: goalChance };
}

/**
 * Calculate distance to goal
 */
function calculateDistanceToGoal() {
    if (matchState.possession === 'home') {
        return 100 - matchState.ballPosition.x;
    } else {
        return matchState.ballPosition.x;
    }
}

/**
 * Get goalkeeper
 */
function getGoalkeeper(team) {
    return team.players.find(p => p.position === 'GK') || team.players[0];
}

/**
 * Handle goal
 */
function handleGoal(scorer, assistant) {
    const assistantPlayer = assistant || getRandomPlayer(matchState.possession === 'home' ? matchState.homeTeam : matchState.awayTeam);
    const isHome = matchState.possession === 'home';
    
    if (isHome) {
        matchState.homeScore++;
        matchState.goals.push({ scorer: scorer.name, assistant: assistantPlayer?.name || null, minute: Math.floor(matchState.currentTime) });
        if (assistantPlayer) {
            matchState.assists.push({ assistant: assistantPlayer.name, minute: Math.floor(matchState.currentTime) });
        }
        // Update goal indicator on field
        const homeGoalIndicator = document.getElementById('home-goal-indicator');
        const homeGoalScore = document.getElementById('home-goal-score');
        if (homeGoalIndicator && homeGoalScore) {
            homeGoalScore.textContent = matchState.homeScore;
            homeGoalIndicator.classList.remove('hidden');
            setTimeout(() => homeGoalIndicator.classList.add('hidden'), 2000);
        }
    } else {
        matchState.awayScore++;
        matchState.goals.push({ scorer: scorer.name, assistant: assistantPlayer?.name || null, minute: Math.floor(matchState.currentTime) });
        if (assistantPlayer) {
            matchState.assists.push({ assistant: assistantPlayer.name, minute: Math.floor(matchState.currentTime) });
        }
        // Update goal indicator on field
        const awayGoalIndicator = document.getElementById('away-goal-indicator');
        const awayGoalScore = document.getElementById('away-goal-score');
        if (awayGoalIndicator && awayGoalScore) {
            awayGoalScore.textContent = matchState.awayScore;
            awayGoalIndicator.classList.remove('hidden');
            setTimeout(() => awayGoalIndicator.classList.add('hidden'), 2000);
        }
    }
    
    showGoalCelebrationRegular(scorer.name, assistantPlayer?.name);
    updateMomentum(0.3);
    
    // Reset for kickoff
    setTimeout(() => {
        matchState.ballPosition = { x: 50, y: 50 };
        handlePossessionChange();
        addCommentary("Kickoff...");
    }, MATCH_CONFIG.GOAL_CELEBRATION_DURATION);
}

/**
 * Show goal celebration (for regular matches)
 */
function showGoalCelebrationRegular(scorer, assistant) {
    const goalBanner = document.getElementById('goal-banner');
    const scorerEl = document.getElementById('goal-scorer');
    const assistEl = document.getElementById('goal-assist');
    const minuteEl = document.getElementById('goal-minute');
    
    if (goalBanner) {
        scorerEl.textContent = scorer;
        assistEl.textContent = assistant ? 'Assist: ' + assistant : '';
        minuteEl.textContent = Math.floor(matchState.currentTime) + "'";
        goalBanner.classList.remove('hidden');
        
        setTimeout(() => {
            goalBanner.classList.add('hidden');
        }, MATCH_CONFIG.GOAL_CELEBRATION_DURATION);
    }
}

/**
 * Handle possession change
 */
function handlePossessionChange() {
    matchState.possession = matchState.possession === 'home' ? 'away' : 'home';
    updateMomentum(-0.05);
    
    // Reset ball position to center to prevent sticking
    matchState.ballPosition = { x: 50, y: 50 };
}

/**
 * Handle foul
 */
function handleFoul(defendingTeam, attackingTeam) {
    const fouler = getRandomPlayer(defendingTeam);
    const isHome = matchState.possession === 'home';
    const color = isHome ? 'red' : 'blue';
    
    if (isHome) {
        matchState.awayFouls++;
    } else {
        matchState.homeFouls++;
    }
    
    // Check if foul is in penalty area
    const inPenaltyArea = isInPenaltyArea();
    
    if (inPenaltyArea) {
        // Penalty awarded
        addCommentary('PENALTY awarded to ' + attackingTeam.name + '!');
        handlePenalty(attackingTeam, defendingTeam);
    } else {
        // Card chance (only yellow cards, no red cards)
        const cardChance = Math.random();
        if (cardChance < 0.20) {
            // Yellow card
            addCommentary('Yellow card for <span class="' + color + '">' + fouler.name + '</span>');
            if (isHome) {
                matchState.awayYellowCards++;
            } else {
                matchState.homeYellowCards++;
            }
        } else {
            addCommentary('Foul by <span class="' + color + '">' + fouler.name + '</span>');
        }
        
        // Free kick
        if (Math.random() < 0.3 && isInAttackingThird()) {
            handleShot(attackingTeam, defendingTeam);
        } else {
            handlePossessionChange();
        }
    }
}

/**
 * Check if foul is in penalty area
 */
function isInPenaltyArea() {
    if (matchState.possession === 'home') {
        return matchState.ballPosition.x > 80;
    } else {
        return matchState.ballPosition.x < 20;
    }
}

/**
 * Handle corner
 */
function handleCorner(attackingTeam) {
    if (matchState.possession === 'home') {
        matchState.homeCorners++;
    } else {
        matchState.awayCorners++;
    }
    
    addCommentary('Corner to ' + attackingTeam.name);
    
    // Position ball in corner
    if (matchState.possession === 'home') {
        matchState.ballPosition = { x: 92, y: Math.random() > 0.5 ? 15 : 85 };
    } else {
        matchState.ballPosition = { x: 8, y: Math.random() > 0.5 ? 15 : 85 };
    }
    
    // 35% chance of goal from corner
    if (Math.random() < 0.35) {
        handleAutoShot(attackingTeam, matchState.possession === 'home' ? matchState.awayTeam : matchState.homeTeam, true);
    }
}

/**
 * Handle throw in
 */
function handleThrowIn(team) {
    addCommentary('Throw in for ' + team.name);
}

/**
 * Update momentum
 */
function updateMomentum(change) {
    matchState.momentum = Math.max(-1, Math.min(1, matchState.momentum + change));
}

/**
 * Show shot selection UI
 */
function showShotSelectionUI(shooter, isPenalty) {
    const shotUI = document.getElementById('shot-selection-ui');
    const shooterName = document.getElementById('shot-shooter-name');
    const targetType = document.getElementById('shot-type');
    
    if (shotUI && shooterName && targetType) {
        shooterName.textContent = shooter.name;
        targetType.textContent = isPenalty ? 'PENALTY KICK' : 'SHOT';
        shotUI.classList.remove('hidden');
        
        // Disable all buttons initially
        document.querySelectorAll('.shot-target-btn').forEach(btn => {
            btn.disabled = false;
        });
    }
}

/**
 * Handle penalty
 */
function handlePenalty(attackingTeam, defendingTeam) {
    const shooter = getRandomPlayer(attackingTeam);
    const isHome = matchState.possession === 'home';
    const color = isHome ? 'blue' : 'red';
    
    // Position ball at penalty spot
    if (matchState.possession === 'home') {
        matchState.ballPosition = { x: 85, y: 50 };
    } else {
        matchState.ballPosition = { x: 15, y: 50 };
    }
    
    addCommentary('PENALTY! <span class="' + color + '">' + shooter.name + '</span> steps up...');
    
    // Auto-calculate penalty result (higher chance for penalties)
    const shotResult = calculateShotResult(shooter, defendingTeam, false, true);
    
    if (shotResult.onTarget) {
        if (isHome) {
            matchState.homeShots++;
            matchState.homeShotsOnTarget++;
        } else {
            matchState.awayShots++;
            matchState.awayShotsOnTarget++;
        }
        
        // Update xG
        const xG = shotResult.goalChance;
        if (isHome) {
            matchState.homeXG += xG;
        } else {
            matchState.awayXG += xG;
        }
        
        if (shotResult.isGoal) {
            handleGoal(shooter, null);
        } else {
            const goalkeeper = getGoalkeeper(defendingTeam);
            const gkColor = !isHome ? 'blue' : 'red';
            addCommentary('Penalty saved by <span class="' + gkColor + '">' + goalkeeper.name + '</span>!');
            handlePossessionChange();
        }
    } else {
        addCommentary('Penalty missed! Goes over the bar.');
        handlePossessionChange();
    }
}

/**
 * Process shot after user selection
 */
function processShot(target) {
    const shooter = matchState.currentShooter;
    const attackingTeam = matchState.possession === 'home' ? matchState.homeTeam : matchState.awayTeam;
    const defendingTeam = matchState.possession === 'home' ? matchState.awayTeam : matchState.homeTeam;
    const isPenalty = matchState.penaltyTeam === attackingTeam;
    const isHome = matchState.possession === 'home';
    const color = isHome ? 'blue' : 'red';
    
    // Calculate shot success based on target
    const targetDifficulty = getTargetDifficulty(target);
    const shotResult = calculateShotResultWithTarget(shooter, defendingTeam, targetDifficulty, isPenalty);
    
    if (shotResult.onTarget) {
        if (isHome) {
            matchState.homeShotsOnTarget++;
        } else {
            matchState.awayShotsOnTarget++;
        }
        
        // Update xG
        const xG = shotResult.goalChance;
        if (isHome) {
            matchState.homeXG += xG;
        } else {
            matchState.awayXG += xG;
        }
        
        if (shotResult.isGoal) {
            addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>! GOAL!');
            handleGoal(shooter, null);
        } else {
            const goalkeeper = getGoalkeeper(defendingTeam);
            const gkColor = !isHome ? 'blue' : 'red';
            addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>! Saved by <span class="' + gkColor + '">' + goalkeeper.name + '</span>!');
            handlePossessionChange();
        }
    } else {
        addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>! Goes ' + getTargetMissDescription(target) + '!');
        handlePossessionChange();
    }
    
    // Hide shot UI and resume match
    hideShotSelectionUI();
    matchState.isPaused = false;
    matchState.currentShooter = null;
    matchState.penaltyTeam = null;
}

/**
 * Handle auto-shot (for headers, etc.)
 */
function handleAutoShot(attackingTeam, defendingTeam, isHeader = false) {
    const shooter = getRandomPlayer(attackingTeam);
    const isHome = matchState.possession === 'home';
    const color = isHome ? 'blue' : 'red';
    
    if (isHome) {
        matchState.homeShots++;
    } else {
        matchState.awayShots++;
    }
    
    addCommentary('SHOT by <span class="' + color + '">' + shooter.name + '</span>!');
    
    const shotResult = calculateShotResult(shooter, defendingTeam, isHeader);
    
    if (shotResult.onTarget) {
        if (isHome) {
            matchState.homeShotsOnTarget++;
        } else {
            matchState.awayShotsOnTarget++;
        }
        
        // Update xG
        const xG = shotResult.goalChance;
        if (isHome) {
            matchState.homeXG += xG;
        } else {
            matchState.awayXG += xG;
        }
        
        if (shotResult.isGoal) {
            handleGoal(shooter, null);
        } else {
            const goalkeeper = getGoalkeeper(defendingTeam);
            const gkColor = !isHome ? 'blue' : 'red';
            addCommentary('Shot saved by <span class="' + gkColor + '">' + goalkeeper.name + '</span>!');
            handlePossessionChange();
        }
    } else {
        addCommentary('Shot goes wide.');
        handlePossessionChange();
    }
}

/**
 * Get target difficulty
 */
function getTargetDifficulty(target) {
    const difficulties = {
        'top-left': 0.8,    // Very hard
        'top-middle': 0.6, // Hard
        'top-right': 0.8,   // Very hard
        'middle-left': 0.4, // Medium
        'middle-middle': 0.2, // Easy
        'middle-right': 0.4, // Medium
        'bottom-left': 0.6, // Hard
        'bottom-middle': 0.4, // Medium
        'bottom-right': 0.6  // Hard
    };
    return difficulties[target] || 0.5;
}

/**
 * Get target miss description
 */
function getTargetMissDescription(target) {
    const descriptions = {
        'top-left': 'wide left',
        'top-middle': 'over the bar',
        'top-right': 'wide right',
        'middle-left': 'wide left',
        'middle-middle': 'straight at the keeper',
        'middle-right': 'wide right',
        'bottom-left': 'wide left',
        'bottom-middle': 'weak',
        'bottom-right': 'wide right'
    };
    return descriptions[target] || 'wide';
}

/**
 * Calculate shot result with target consideration
 */
function calculateShotResultWithTarget(shooter, defendingTeam, targetDifficulty, isPenalty) {
    const goalkeeper = getGoalkeeper(defendingTeam);
    
    // Base chance
    let baseChance = 0.5;
    
    // Target difficulty penalty
    baseChance -= targetDifficulty * 0.3;
    
    // Shooting stat (VERY IMPORTANT)
    const shootingBonus = (shooter.shooting / 100) * 0.35;
    
    // Penalty bonus (higher chance for penalties)
    const penaltyBonus = isPenalty ? 0.15 : 0;
    
    // Goalkeeper (VERY IMPORTANT)
    const gkPenalty = (goalkeeper.rating / 100) * 0.3;
    
    // Position bonus
    const positionBonus = matchState.possession === 'home' 
        ? (matchState.ballPosition.x / 100) * 0.1
        : ((100 - matchState.ballPosition.x) / 100) * 0.1;
    
    // Form and stamina
    const formBonus = (shooter.form / 100) * 0.05;
    const staminaPenalty = ((100 - shooter.currentStamina) / 100) * 0.08;
    
    const onTargetChance = baseChance + shootingBonus + penaltyBonus - gkPenalty + positionBonus + formBonus - staminaPenalty;
    const isOnTarget = onTargetChance > Math.random();
    
    let isGoal = false;
    let goalChance = 0;
    
    if (isOnTarget) {
        goalChance = onTargetChance * 0.6; // Even on target, might be saved
        isGoal = goalChance > Math.random();
    }
    
    return { onTarget: isOnTarget, isGoal: isGoal, goalChance: goalChance };
}

/**
 * Hide shot selection UI
 */
function hideShotSelectionUI() {
    const shotUI = document.getElementById('shot-selection-ui');
    if (shotUI) {
        shotUI.classList.add('hidden');
    }
}

/**
 * Show squad preview
 */
function showSquadPreview() {
    const overlay = document.getElementById('squad-preview-overlay');
    const homeName = document.getElementById('preview-home-name');
    const homeRating = document.getElementById('preview-home-rating');
    const homeSquad = document.getElementById('preview-home-squad');
    const awayName = document.getElementById('preview-away-name');
    const awayRating = document.getElementById('preview-away-rating');
    const awaySquad = document.getElementById('preview-away-squad');
    const startBtn = document.getElementById('start-match-btn');
    
    if (overlay && homeName && homeRating && homeSquad && awayName && awayRating && awaySquad && startBtn) {
        homeName.textContent = matchState.homeTeam.name;
        homeRating.textContent = matchState.homeTeam.rating;
        awayName.textContent = matchState.awayTeam.name;
        awayRating.textContent = matchState.awayTeam.rating;
        
        // Render home squad
        homeSquad.innerHTML = '';
        matchState.homeTeam.players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = 'squad-player';
            playerEl.innerHTML = '<span class="squad-player-name">' + player.name + '</span><div class="squad-player-info"><span>' + player.position + '</span><span>' + player.rating + '</span></div>';
            homeSquad.appendChild(playerEl);
        });
        
        // Render away squad
        awaySquad.innerHTML = '';
        matchState.awayTeam.players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = 'squad-player';
            playerEl.innerHTML = '<span class="squad-player-name">' + player.name + '</span><div class="squad-player-info"><span>' + player.position + '</span><span>' + player.rating + '</span></div>';
            awaySquad.appendChild(playerEl);
        });
        
        overlay.classList.remove('hidden');
        
        // Remove old event listener
        const newStartBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newStartBtn, startBtn);
        
        newStartBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            renderMatchUI();
            startMatch();
        });
    }
}

/**
 * Show attack banner
 */
function showAttackBanner(teamName) {
    const banner = document.getElementById('attack-banner');
    const teamEl = document.getElementById('attack-team');
    
    if (banner && teamEl) {
        teamEl.textContent = teamName;
        
        // Color the banner based on which team is attacking
        if (matchState.possession === 'home') {
            banner.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.9) 100%)';
            banner.style.color = '#ffffff';
        } else {
            banner.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)';
            banner.style.color = '#ffffff';
        }
        
        banner.classList.remove('hidden');
        
        setTimeout(() => {
            banner.classList.add('hidden');
        }, MATCH_CONFIG.ATTACK_DURATION);
    }
}

/**
 * Handle half-time
 */
function handleHalfTime() {
    addCommentary("HALF TIME");
    
    const halftimeBanner = document.getElementById('halftime-banner');
    if (halftimeBanner) {
        halftimeBanner.classList.remove('hidden');
        setTimeout(() => {
            halftimeBanner.classList.add('hidden');
        }, 2000);
    }
}

/**
 * Handle full-time
 */
function handleFullTime() {
    matchState.isRunning = false;
    clearInterval(matchState.matchInterval);
    clearInterval(matchState.eventInterval);
    
    addCommentary("FULL TIME");
    showMatchResults();
}

/**
 * Add commentary
 */
function addCommentary(text) {
    const minute = Math.floor(matchState.currentTime);
    matchState.commentary.unshift({
        minute: minute,
        text: text
    });
    
    // Keep only last 12 comments
    if (matchState.commentary.length > 12) {
        matchState.commentary.pop();
    }
    
    updateCommentaryUI();
}

/**
 * Get random player
 */
function getRandomPlayer(team) {
    return team.players[Math.floor(Math.random() * team.players.length)];
}

/**
 * Render match UI
 */
function renderMatchUI() {
    document.getElementById('match-home-name').textContent = matchState.homeTeam.name;
    document.getElementById('match-away-name').textContent = matchState.awayTeam.name;
    document.getElementById('match-home-score').textContent = '0';
    document.getElementById('match-away-score').textContent = '0';
    document.getElementById('match-time').textContent = "0'";
    
    updateMatchUI();
}

/**
 * Update match UI
 */
function updateMatchUI() {
    document.getElementById('match-home-score').textContent = matchState.homeScore;
    document.getElementById('match-away-score').textContent = matchState.awayScore;
    
    const minutes = Math.floor(matchState.currentTime);
    document.getElementById('match-time').textContent = minutes + "'";
    
    // Update possession
    const totalPossession = matchState.homePossessionTime + matchState.awayPossessionTime || 1;
    const homePossessionPct = Math.round((matchState.homePossessionTime / totalPossession) * 100);
    const awayPossessionPct = 100 - homePossessionPct;
    document.getElementById('match-possession').textContent = homePossessionPct + '% - ' + awayPossessionPct + '%';
    
    // Update stats
    document.getElementById('match-shots').textContent = matchState.homeShots + ' - ' + matchState.awayShots;
    document.getElementById('match-shots-on-target').textContent = matchState.homeShotsOnTarget + ' - ' + matchState.awayShotsOnTarget;
    document.getElementById('match-corners').textContent = matchState.homeCorners + ' - ' + matchState.awayCorners;
    document.getElementById('match-fouls').textContent = matchState.homeFouls + ' - ' + matchState.awayFouls;
    document.getElementById('match-xg').textContent = matchState.homeXG.toFixed(2) + ' - ' + matchState.awayXG.toFixed(2);
    
    // Update ball position
    const ball = document.getElementById('ball');
    if (ball) {
        ball.style.left = matchState.ballPosition.x + '%';
        ball.style.top = matchState.ballPosition.y + '%';
        ball.style.transform = 'translate(-50%, -50%)';
    }
}

/**
 * Update commentary UI
 */
function updateCommentaryUI() {
    const feed = document.getElementById('commentary-feed');
    if (!feed) return;
    
    feed.innerHTML = '';
    
    matchState.commentary.forEach(comment => {
        const item = document.createElement('div');
        item.className = 'commentary-item';
        item.innerHTML = '<span class="commentary-minute">' + comment.minute + "'</span> " + comment.text;
        feed.appendChild(item);
    });
}

/**
 * Show match results
 */
async function showMatchResults() {
    const overlay = document.getElementById('match-results-overlay');
    overlay.classList.remove('hidden');
    
    // Update results
    document.getElementById('results-home-name').textContent = matchState.homeTeam.name;
    document.getElementById('results-away-name').textContent = matchState.awayTeam.name;
    document.getElementById('results-home-score').textContent = matchState.homeScore;
    document.getElementById('results-away-score').textContent = matchState.awayScore;
    
    // Stats
    const totalPossession = matchState.homePossessionTime + matchState.awayPossessionTime || 1;
    const homePossessionPct = Math.round((matchState.homePossessionTime / totalPossession) * 100);
    const awayPossessionPct = 100 - homePossessionPct;
    
    document.getElementById('results-possession').textContent = homePossessionPct + '% - ' + awayPossessionPct + '%';
    document.getElementById('results-shots').textContent = matchState.homeShots + ' - ' + matchState.awayShots;
    document.getElementById('results-shots-on-target').textContent = matchState.homeShotsOnTarget + ' - ' + matchState.awayShotsOnTarget;
    document.getElementById('results-corners').textContent = matchState.homeCorners + ' - ' + matchState.awayCorners;
    document.getElementById('results-xg').textContent = matchState.homeXG.toFixed(2) + ' - ' + matchState.awayXG.toFixed(2);
    
    // Pass accuracy
    const homePassAccuracy = matchState.homePasses > 0 ? Math.round((matchState.homePassesCompleted / matchState.homePasses) * 100) : 0;
    const awayPassAccuracy = matchState.awayPasses > 0 ? Math.round((matchState.awayPassesCompleted / matchState.awayPasses) * 100) : 0;
    document.getElementById('results-pass-accuracy').textContent = homePassAccuracy + '% - ' + awayPassAccuracy + '%';
    
    // Goals
    const goalsList = document.getElementById('goals-list');
    goalsList.innerHTML = '';
    
    matchState.goals.forEach(goal => {
        const goalItem = document.createElement('div');
        goalItem.className = 'goal-item';
        goalItem.textContent = goal.minute + "' - " + goal.scorer + (goal.assistant ? ' (Assist: ' + goal.assistant + ')' : '');
        goalsList.appendChild(goalItem);
    });
    
    // Player of the match
    const playerOfMatch = determinePlayerOfMatch();
    document.getElementById('player-of-match').textContent = playerOfMatch;
    
    // Calculate rewards based on match type and result
    let coinReward = 0;
    let rankPointsChange = 0;
    
    if (matchState.isRanked) {
        // Ranked rewards
        if (matchState.homeScore > matchState.awayScore) {
            coinReward = 1000; // Win bonus
            rankPointsChange = 25; // Win points
        } else if (matchState.homeScore < matchState.awayScore) {
            coinReward = 300; // Loss consolation
            rankPointsChange = -15; // Loss points
        } else {
            coinReward = 500; // Draw
            rankPointsChange = 5; // Draw points
        }
    } else {
        // Unranked/Friend rewards
        if (matchState.homeScore > matchState.awayScore) {
            coinReward = 500; // Win bonus
        } else if (matchState.homeScore < matchState.awayScore) {
            coinReward = 200; // Loss consolation
        } else {
            coinReward = 350; // Draw
        }
    }
    
    // Goal bonus
    const goalBonus = matchState.homeScore * 50;
    coinReward += goalBonus;
    
    document.getElementById('reward-coins').textContent = coinReward;
    document.getElementById('reward-xp').textContent = '0';
    document.getElementById('reward-rank-points').textContent = matchState.isRanked ? (rankPointsChange > 0 ? '+' + rankPointsChange : rankPointsChange) : 'N/A';
    document.getElementById('reward-pack-progress').textContent = '0%';
    document.getElementById('reward-club-xp').textContent = '0';
    
    // Show cooldown for ranked/unranked
    const cooldownSection = document.getElementById('cooldown-section');
    const returnBtn = document.getElementById('return-to-menu-btn');
    
    if (matchState.isRanked || matchState.matchType === 'unranked') {
        if (cooldownSection) {
            cooldownSection.style.display = 'block';
            cooldownSection.innerHTML = `
                <p class="text-muted">Cooldown active for 4 minutes</p>
                <div class="cooldown-timer" id="post-match-cooldown">4:00</div>
            `;
        }
        if (returnBtn) returnBtn.style.display = 'none';
    } else {
        if (cooldownSection) cooldownSection.style.display = 'none';
        if (returnBtn) returnBtn.style.display = 'block';
    }
    
    // Actually award rewards to user
    await awardRewards(coinReward, 0, rankPointsChange);
    
    // Bind return to menu button
    if (returnBtn) {
        // Remove old listener by cloning
        const newReturnBtn = returnBtn.cloneNode(true);
        returnBtn.parentNode.replaceChild(newReturnBtn, returnBtn);
        
        newReturnBtn.addEventListener('click', async () => {
            console.log('[Match Engine] Return to menu clicked');
            document.getElementById('match-results-overlay').classList.add('hidden');
            
            // Cleanup match state
            cleanupMatch();
            
            // Switch to dashboard (home) screen
            const screens = document.querySelectorAll('.app-screen');
            screens.forEach(screen => screen.classList.add('hidden'));
            document.getElementById('dashboard-screen').classList.remove('hidden');
            
            // Update navigation
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            const dashboardBtn = document.querySelector('[data-target-screen="dashboard"]');
            if (dashboardBtn) dashboardBtn.classList.add('active');
            
            // Refresh rank display to show updated points
            if (window.updateRankDisplay) {
                window.updateRankDisplay();
            }
            
            // Reload user profile
            if (window.currentUser) {
                const { getUserProfile } = await import('./database.js');
                window.userProfile = await getUserProfile(window.currentUser.uid);
            }
        });
    }
    
    console.log('[Match Engine] Match results displayed');
}

/**
 * Award rewards to user - Using new database functions
 */
async function awardRewards(coins, xp, rankPointsChange) {
    try {
        const currentUser = window.currentUser;
        if (!currentUser) return;
        
        const { getUserProfile, updateCoinsTransaction, updateRankPoints, setMatchCooldown, getRankFromPoints } = await import('./database.js');
        
        const profile = await getUserProfile(currentUser.uid);
        
        if (profile) {
            console.log('[Match Engine] Awarding rewards:', { coins, rankPointsChange });
            
            // Update coins using transaction
            await updateCoinsTransaction(currentUser.uid, coins);
            
            // Update rank points if ranked match
            if (matchState.isRanked && rankPointsChange !== 0) {
                await updateRankPoints(currentUser.uid, rankPointsChange);
            }
            
            // Get updated rank points
            const updatedProfile = await getUserProfile(currentUser.uid);
            const newRankPoints = updatedProfile?.rankPoints || 0;
            const newRank = getRankFromPoints(newRankPoints);
            
            console.log('[Match Engine] New rank points:', newRankPoints, 'Rank:', newRank);
            
            // Update stats
            const newStats = {
                wins: (profile.stats?.wins || 0) + (matchState.homeScore > matchState.awayScore ? 1 : 0),
                draws: (profile.stats?.draws || 0) + (matchState.homeScore === matchState.awayScore ? 1 : 0),
                losses: (profile.stats?.losses || 0) + (matchState.homeScore < matchState.awayScore ? 1 : 0),
                highestRankPoints: Math.max(profile.stats?.highestRankPoints || 0, newRankPoints),
                currentRank: newRank,
                coinsEarned: (profile.stats?.coinsEarned || 0) + coins,
                goalsScored: (profile.stats?.goalsScored || 0) + matchState.homeScore,
                goalsConceded: (profile.stats?.goalsConceded || 0) + matchState.awayScore
            };
            
            // Update user profile with new stats
            const statsRef = ref(db, 'users/' + currentUser.uid + '/stats');
            await update(statsRef, newStats);
            
            // Set match cooldown for ranked/unranked
            if (matchState.isRanked || matchState.matchType === 'unranked') {
                await setMatchCooldown(currentUser.uid, 4 * 60 * 1000); // 4 minutes
                startPostMatchCooldown();
            }
            
            // Update local profile
            if (window.userProfile) {
                window.userProfile.rankPoints = newRankPoints;
                window.userProfile.stats = newStats;
            }
            
            console.log('[Match Engine] Rewards awarded: ' + coins + ' coins, ' + rankPointsChange + ' rank points (total: ' + newRankPoints + ')');
        }
    } catch (error) {
        console.error('[Match Engine] Error awarding rewards:', error);
    }
}

/**
 * Start post-match cooldown timer
 */
function startPostMatchCooldown() {
    const cooldownTimer = document.getElementById('post-match-cooldown');
    if (!cooldownTimer) return;
    
    let remainingSeconds = 4 * 60; // 4 minutes
    
    const interval = setInterval(() => {
        remainingSeconds--;
        
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        cooldownTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (remainingSeconds <= 0) {
            clearInterval(interval);
            const returnBtn = document.getElementById('return-to-menu-btn');
            const cooldownSection = document.getElementById('cooldown-section');
            
            if (cooldownSection) cooldownSection.style.display = 'none';
            if (returnBtn) returnBtn.style.display = 'block';
            
            // Bind return button
            if (returnBtn) {
                returnBtn.addEventListener('click', handleReturnToMenu);
            }
        }
    }, 1000);
}

/**
 * Determine player of the match
 */
function determinePlayerOfMatch() {
    const allPlayers = [...matchState.homeTeam.players, ...matchState.awayTeam.players];
    const scorers = matchState.goals.map(g => g.scorer);
    
    // Prefer goal scorers
    const scoringPlayers = allPlayers.filter(p => scorers.includes(p.name));
    if (scoringPlayers.length > 0) {
        return scoringPlayers[0].name;
    }
    
    // Otherwise highest rated
    allPlayers.sort((a, b) => b.rating - a.rating);
    return allPlayers[0].name;
}

/**
 * Start cooldown timer
 */
function startCooldownTimer(endTime) {
    const cooldownSection = document.getElementById('cooldown-section');
    const timerEl = document.getElementById('cooldown-timer');
    
    const updateTimer = () => {
        const now = Date.now();
        const remaining = endTime - now;
        
        if (remaining <= 0) {
            if (cooldownSection) cooldownSection.style.display = 'none';
            return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        if (timerEl) timerEl.textContent = minutes + ':' + seconds.toString().padStart(2, '0');
        
        setTimeout(updateTimer, 1000);
    };
    
    updateTimer();
}

/**
 * Show cooldown screen
 */
function showCooldownScreen(endTime) {
    const overlay = document.getElementById('match-results-overlay');
    overlay.classList.remove('hidden');
    
    const header = document.querySelector('.results-header h2');
    const finalScore = document.querySelector('.final-score');
    const statsSummary = document.querySelector('.match-stats-summary');
    const goalsSummary = document.querySelector('.goals-summary');
    const rewardsSection = document.querySelector('.rewards-section');
    const cooldownSection = document.getElementById('cooldown-section');
    const returnBtn = document.getElementById('return-to-menu-btn');
    
    if (header) header.textContent = 'MATCH COOLDOWN';
    if (finalScore) finalScore.style.display = 'none';
    if (statsSummary) statsSummary.style.display = 'none';
    if (goalsSummary) goalsSummary.style.display = 'none';
    if (rewardsSection) rewardsSection.style.display = 'none';
    if (cooldownSection) cooldownSection.style.display = 'block';
    if (returnBtn) returnBtn.style.display = 'none';
    
    startCooldownTimer(endTime);
}

/**
 * Handle return to menu button click
 */
function handleReturnToMenu() {
    console.log('[Match Engine] Return to menu clicked');
    document.getElementById('match-results-overlay').classList.add('hidden');
    
    // Cleanup match state
    cleanupMatch();
    
    // Switch to dashboard (home) screen
    const screens = document.querySelectorAll('.app-screen');
    screens.forEach(screen => screen.classList.add('hidden'));
    document.getElementById('dashboard-screen').classList.remove('hidden');
    
    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const dashboardBtn = document.querySelector('[data-target-screen="dashboard"]');
    if (dashboardBtn) dashboardBtn.classList.add('active');
    
    // Refresh rank display to show updated points
    if (window.updateRankDisplay) {
        window.updateRankDisplay();
    }
    
    // Reload user profile
    if (window.currentUser) {
        window.getUserProfile(window.currentUser.uid).then(profile => {
            window.userProfile = profile;
        });
    }
}

/**
 * Cleanup match
 */
export function cleanupMatch() {
    if (matchState.matchInterval) {
        clearInterval(matchState.matchInterval);
        matchState.matchInterval = null;
    }
    if (matchState.eventInterval) {
        clearInterval(matchState.eventInterval);
        matchState.eventInterval = null;
    }
    matchState.isRunning = false;

    // Clear commentary feed
    const commentaryFeed = document.getElementById('commentary-feed');
    if (commentaryFeed) {
        commentaryFeed.innerHTML = '';
    }

    // Reset match state completely
    resetMatchState();

    // Hide any overlays
    const overlay = document.getElementById('match-results-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }

    // Reset score display
    const homeScore = document.getElementById('match-home-score');
    const awayScore = document.getElementById('match-away-score');
    const matchTime = document.getElementById('match-time');
    if (homeScore) homeScore.textContent = '0';
    if (awayScore) awayScore.textContent = '0';
    if (matchTime) matchTime.textContent = "0'";

    console.log('[Match Engine] Match cleaned up and state reset');
}