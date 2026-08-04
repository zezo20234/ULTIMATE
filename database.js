/* ==========================================================================
   DATABASE MANAGER
   Handles all Firebase Realtime Database reads, writes, listeners, 
   and secure atomic transactions.
   ========================================================================== */

import { db } from './firebase.js';
import { 
    ref, 
    set, 
    get, 
    update, 
    remove, 
    child, 
    push, 
    onValue, 
    runTransaction, 
    query, 
    orderByChild, 
    equalTo,
    limitToLast
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Database Root Paths
const PATHS = {
    USERS: 'users',
    PLAYERS: 'players', // The master player database
    PACKS: 'packs',
    MARKET: 'market',
    AI: 'ai',
    MATCHES: 'matches',
    MATCHMAKING_QUEUES: 'matchmaking_queues',
    ACTIVE_MATCHES: 'active_matches',
    SETTINGS: 'settings',
    STATS: 'statistics',
    STATIC: 'static',
    ONLINE: 'online_users'
};

/* ==========================================================================
   USER & PROFILE MANAGEMENT
   ========================================================================== */

/**
 * Creates a new user profile in the database upon registration.
 * @param {string} uid - Firebase Auth User ID.
 * @param {string} clubName - The chosen club name.
 * @param {string} email - User's email.
 * @returns {Promise<void>}
 */
export async function createUserProfile(uid, clubName, email) {
    const userRef = ref(db, `${PATHS.USERS}/${uid}`);
    const initialData = {
        profile: {
            clubName: clubName,
            email: email,
            createdAt: Date.now(),
            role: 'user'
        },
        economy: {
            coins: 30000,
            fp: 0
        },
        rankPoints: 500, // SIMPLE: Store at root level
        stats: {
            wins: 0,
            draws: 0,
            losses: 0,
            highestRankPoints: 500,
            currentRank: 'Amateur III',
            coinsEarned: 0,
            packsOpened: 0,
            goalsScored: 0,
            goalsConceded: 0,
            totalMatchTime: 0
        },
        squad: {
            formation: '4-3-3',
            starters: {},
            bench: {}
        },
        club: {},
        transferList: {},
        transferTargets: {},
        hasReceivedStarterPack: false
    };
    await set(userRef, initialData);
}

/**
 * Give starter pack to new user (12 worst players, one for each position)
 * @param {string} uid - User ID
 * @returns {Promise<void>}
 */
export async function giveStarterPack(uid) {
    try {
        const { loadPlayerDatabase } = await import('./players.js');
        const players = await loadPlayerDatabase();
        
        // Get user profile
        const userRef = ref(db, `${PATHS.USERS}/${uid}`);
        const snapshot = await get(userRef);
        if (!snapshot.exists()) return;
        
        const userData = snapshot.val();
        
        // Check if already received
        if (userData.hasReceivedStarterPack) {
            console.log('[Database] User already received starter pack');
            return;
        }
        
        // Get worst players for each position
        const positions = ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'RW', 'ST', 'LW', 'CM', 'CB'];
        const sortedPlayers = [...players].sort((a, b) => a.rating - b.rating);
        
        // Deduct 5K coins
        if (userData.economy.coins < 5000) {
            console.log('[Database] Not enough coins for starter pack');
            return;
        }
        
        const newClub = userData.club || {};
        let playersAdded = 0;
        
        positions.forEach((pos, index) => {
            const positionPlayers = sortedPlayers.filter(p => p.position === pos);
            if (positionPlayers.length > 0) {
                const worstPlayer = positionPlayers[0];
                const instanceId = `starter_${pos}_${Date.now()}_${index}`;
                
                newClub[instanceId] = {
                    ...worstPlayer,
                    instanceId: instanceId,
                    obtainedAt: Date.now()
                };
                playersAdded++;
            }
        });
        
        // Update user data
        await update(userRef, {
            economy: {
                coins: userData.economy.coins - 5000
            },
            club: newClub,
            hasReceivedStarterPack: true
        });
        
        console.log(`[Database] Starter pack given to user. Added ${playersAdded} players for 5K coins`);
        
    } catch (error) {
        console.error('[Database] Error giving starter pack:', error);
    }
}

/**
 * Fetches the complete user profile data.
 * @param {string} uid - Firebase Auth User ID.
 * @returns {Promise<Object|null>} User data object or null if not found.
 */
export async function getUserProfile(uid) {
    const userRef = ref(db, `${PATHS.USERS}/${uid}`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Safely updates a user's coin balance using a transaction to prevent race conditions.
 * @param {string} uid - User ID.
 * @param {number} amountDelta - Amount to add (positive) or subtract (negative).
 * @returns {Promise<boolean>} True if successful, false if insufficient funds.
 */
export async function updateCoinsTransaction(uid, amountDelta) {
    const coinsRef = ref(db, `${PATHS.USERS}/${uid}/economy/coins`);
    let success = true;

    await runTransaction(coinsRef, (currentCoins) => {
        if (currentCoins === null) return 0; // Initialize if null somehow
        const newBalance = currentCoins + amountDelta;
        if (newBalance < 0) {
            success = false;
            return; // Abort transaction if insufficient funds
        }
        return newBalance;
    });

    return success;
}

/* ==========================================================================
   REAL-TIME LISTENERS
   ========================================================================== */

/**
 * Subscribes to a user's coin balance for real-time UI updates.
 * @param {string} uid - User ID.
 * @param {Function} callback - Function called with the new coin balance.
 * @returns {Function} Unsubscribe function.
 */
export function listenToUserCoins(uid, callback) {
    const coinsRef = ref(db, `${PATHS.USERS}/${uid}/economy/coins`);
    return onValue(coinsRef, (snapshot) => {
        const coins = snapshot.val() || 0;
        callback(coins);
    });
}

/**
 * Subscribes to a user's stats (wins, rank, etc.).
 * @param {string} uid - User ID.
 * @param {Function} callback - Function called with stats object.
 * @returns {Function} Unsubscribe function.
 */
export function listenToUserStats(uid, callback) {
    const statsRef = ref(db, `${PATHS.USERS}/${uid}/stats`);
    return onValue(statsRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });
}

/* ==========================================================================
   CLUB & INVENTORY MANAGEMENT
   ========================================================================== */

/**
 * Performs a multi-path atomic update to add multiple cards to a user's club.
 * Essential for pack openings to ensure all cards save simultaneously.
 * @param {string} uid - User ID.
 * @param {Array<Object>} players - Array of player instance objects.
 * @returns {Promise<void>}
 */
export async function addPlayersToClubAtomic(uid, players) {
    const updates = {};
    players.forEach(player => {
        updates[`${PATHS.USERS}/${uid}/club/${player.instanceId}`] = player;
    });
    const dbRootRef = ref(db);
    await update(dbRootRef, updates);
}

/**
 * Quick sells a player: Removes from club and adds coins in one atomic update.
 * @param {string} uid - User ID.
 * @param {string} instanceId - The unique ID of the specific card.
 * @param {number} qsValue - The quick sell coin value.
 * @returns {Promise<boolean>} True if successful.
 */
export async function quickSellPlayer(uid, instanceId, qsValue) {
    // First, verify ownership and ensure we don't duplicate transactions
    const playerRef = ref(db, `${PATHS.USERS}/${uid}/club/${instanceId}`);
    const snapshot = await get(playerRef);
    if (!snapshot.exists()) return false;

    // Use a transaction on coins, then delete the player
    const transactionSuccess = await updateCoinsTransaction(uid, qsValue);
    if (transactionSuccess) {
        await remove(playerRef);
        return true;
    }
    return false;
}

/**
 * Saves the user's active squad formation and positions.
 * Only stores instanceIds to prevent data duplication issues.
 * @param {string} uid - User ID.
 * @param {string} formation - e.g. '4-3-3'.
 * @param {Object} activeMap - Position key mapping to player instanceId.
 * @param {Object} benchMap - Bench slot mapping to player instanceId.
 * @returns {Promise<void>}
 */
export async function saveSquad(uid, formation, activeMap, benchMap) {
    // Convert player objects to instanceId-only mappings
    const startersIds = {};
    Object.entries(activeMap).forEach(([position, player]) => {
        if (player) {
            startersIds[position] = {
                instanceId: player.instanceId || player.id
            };
        }
    });

    const benchIds = {};
    Object.entries(benchMap).forEach(([slot, player]) => {
        if (player) {
            benchIds[slot] = {
                instanceId: player.instanceId || player.id
            };
        }
    });

    const squadRef = ref(db, `${PATHS.USERS}/${uid}/squad`);
    await update(squadRef, {
        formation: formation,
        starters: startersIds,
        bench: benchIds
    });
}

/* ==========================================================================
   TRANSFER MARKET OPERATIONS
   ========================================================================== */

/**
 * Lists a player on the transfer market. Removes from club inventory atomically.
 * @param {string} uid - Seller's User ID (or AI ID).
 * @param {Object} playerObj - The specific card data.
 * @param {number} startPrice - Bid starting price.
 * @param {number} buyNowPrice - Instant purchase price.
 * @param {number} durationHours - Listing duration.
 * @param {string} sellerType - 'user' or 'ai'.
 * @returns {Promise<void>}
 */
export async function listPlayerOnMarket(uid, playerObj, startPrice, buyNowPrice, durationHours, sellerType = 'user') {
    const listingId = `list_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const expiresAt = Date.now() + (durationHours * 60 * 60 * 1000);
    
    const listingData = {
        id: listingId,
        sellerId: uid,
        sellerType: sellerType,
        player: playerObj,
        startPrice: startPrice,
        buyNowPrice: buyNowPrice,
        currentBid: 0,
        highestBidder: null,
        createdAt: Date.now(),
        expiresAt: expiresAt,
        status: 'active' // 'active', 'sold', 'expired'
    };

    const updates = {};
    updates[`${PATHS.MARKET}/${listingId}`] = listingData;
    
    // If it's a real user, remove the player from their club simultaneously
    if (sellerType === 'user') {
        updates[`${PATHS.USERS}/${uid}/club/${playerObj.instanceId}`] = null;
    }

    const dbRootRef = ref(db);
    await update(dbRootRef, updates);
}

/**
 * Cancels an active market listing and returns the player to the seller's club.
 * @param {string} uid - Seller's User ID.
 * @param {string} listingId - The listing ID to cancel.
 * @returns {Promise<boolean>} True if successful.
 */
export async function cancelMarketListing(uid, listingId) {
    const listingRef = ref(db, `${PATHS.MARKET}/${listingId}`);
    const snapshot = await get(listingRef);
    
    if (!snapshot.exists()) return false;
    const listing = snapshot.val();
    
    if (listing.sellerId !== uid) return false;
    if (listing.status !== 'active') return false;
    
    const updates = {};
    updates[`${PATHS.MARKET}/${listingId}/status`] = 'expired';
    updates[`${PATHS.USERS}/${uid}/club/${listing.player.instanceId}`] = listing.player;
    
    const dbRootRef = ref(db);
    await update(dbRootRef, updates);
    return true;
}

/* ==========================================================================
   PLAYER DATABASE MANAGEMENT
   ========================================================================== */

/**
 * Fetches the master player database from Firebase.
 * @returns {Promise<Array>} Array of player objects or empty array if not found.
 */
export async function getPlayerDatabase() {
    const playersRef = ref(db, `${PATHS.STATIC}/players`);
    const snapshot = await get(playersRef);
    
    if (snapshot.exists()) {
        const data = snapshot.val();
        // Handle both array and object formats
        return Array.isArray(data) ? data : Object.values(data);
    }
    return [];
}

/**
 * Initializes the master player database in Firebase if it doesn't exist.
 * @param {Array} players - Array of player objects to seed.
 * @returns {Promise<void>}
 */
export async function initializePlayerDatabase(players) {
    const playersRef = ref(db, `${PATHS.STATIC}/players`);
    const snapshot = await get(playersRef);
    
    if (!snapshot.exists()) {
        await set(playersRef, players);
        console.log('[Database] Initialized player database with', players.length, 'players');
    }
}

/* ==========================================================================
   PACK STORE MANAGEMENT
   ========================================================================== */

/**
 * Fetches available packs from the store.
 * @returns {Promise<Object>} Object containing pack configurations.
 */
export async function getStorePacks() {
    const packsRef = ref(db, `${PATHS.PACKS}`);
    const snapshot = await get(packsRef);
    
    if (snapshot.exists()) {
        return snapshot.val();
    }
    
    // Return default packs if none exist in database
    return getDefaultPacks();
}

/**
 * Gets the default pack configurations.
 * @returns {Object} Default pack configurations.
 */
function getDefaultPacks() {
    return {
        bronze_pack: {
            id: 'bronze_pack',
            name: 'Bronze Pack',
            cost: 400,
            items: 3,
            odds: { bronze: 90, silver: 8, gold: 2 },
            description: 'Contains 3 bronze players with rare chance for silver/gold'
        },
        silver_pack: {
            id: 'silver_pack',
            name: 'Silver Pack',
            cost: 2500,
            items: 3,
            odds: { bronze: 20, silver: 70, gold: 10 },
            description: 'Contains 3 silver players with rare chance for gold'
        },
        gold_pack: {
            id: 'gold_pack',
            name: 'Gold Pack',
            cost: 5000,
            items: 3,
            odds: { silver: 30, gold: 60, rareGold: 10 },
            description: 'Contains 3 gold players with rare chance for rare gold'
        },
        premium_gold_pack: {
            id: 'premium_gold_pack',
            name: 'Premium Gold Pack',
            cost: 7500,
            items: 3,
            odds: { gold: 40, rareGold: 55, totw: 5 },
            description: 'Contains 3 players with guaranteed rare gold or better'
        },
        rare_gold_pack: {
            id: 'rare_gold_pack',
            name: 'Rare Gold Pack',
            cost: 15000,
            items: 6,
            odds: { gold: 20, rareGold: 75, totw: 5 },
            description: 'Contains 6 players with high chance for rare gold'
        },
        mega_pack: {
            id: 'mega_pack',
            name: 'Mega Pack',
            cost: 25000,
            items: 12,
            odds: { gold: 30, rareGold: 60, totw: 8, icon: 2 },
            description: 'Contains 12 players with rare chance for special cards'
        },
        ultimate_pack: {
            id: 'ultimate_pack',
            name: 'Ultimate Pack',
            cost: 50000,
            items: 24,
            odds: { gold: 20, rareGold: 70, totw: 8, icon: 2 },
            description: 'Contains 24 players with best odds for top cards'
        },
        promo_pack: {
            id: 'promo_pack',
            name: 'Promo Pack',
            cost: 100000,
            items: 6,
            odds: { rareGold: 40, totw: 50, icon: 10 },
            description: 'Special promo pack with guaranteed high-rated cards'
        }
    };
}

/**
 * Initializes the pack store with default packs if it doesn't exist.
 * @returns {Promise<void>}
 */
export async function initializePackStore() {
    const packsRef = ref(db, `${PATHS.PACKS}`);
    const snapshot = await get(packsRef);
    
    if (!snapshot.exists()) {
        const defaultPacks = getDefaultPacks();
        await set(packsRef, defaultPacks);
        console.log('[Database] Initialized pack store with', Object.keys(defaultPacks).length, 'packs');
    } else {
        console.log('[Database] Pack store already exists with', Object.keys(snapshot.val()).length, 'packs');
    }
}

/* ==========================================================================
   SETTINGS & CONFIGURATION
   ========================================================================== */

/**
 * Gets the current market tax rate.
 * @returns {Promise<number>} Tax rate percentage.
 */
export async function getMarketTaxRate() {
    const taxRef = ref(db, `${PATHS.SETTINGS}/marketTax`);
    const snapshot = await get(taxRef);
    
    if (snapshot.exists()) {
        return snapshot.val();
    }
    return 5; // Default 5% tax
}

/**
 * Gets AI configuration settings.
 * @returns {Promise<Object>} AI configuration object.
 */
export async function getAISettings() {
    const aiRef = ref(db, `${PATHS.SETTINGS}/ai`);
    const snapshot = await get(aiRef);
    
    if (snapshot.exists()) {
        return snapshot.val();
    }
    
    return {
        enabled: true,
        marketActivity: true,
        listingInterval: 300000, // 5 minutes
        maxListingsPerInterval: 10,
        opponentStrength: 'balanced'
    };
}

/* ==========================================================================
   GENERAL DATABASE OPERATIONS (Used by other services)
   ========================================================================== */

/**
 * Generic read operation for any path.
 * @param {string} path - Database path to read.
 * @returns {Promise<any>} Data at path or null.
 */
export async function readData(path) {
    const dataRef = ref(db, path);
    const snapshot = await get(dataRef);
    return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Generic write operation for any path.
 * @param {string} path - Database path to write to.
 * @param {any} data - Data to write.
 * @returns {Promise<boolean>} True if successful.
 */
export async function updateData(path, data) {
    try {
        const dataRef = ref(db, path);
        await update(dataRef, data);
        return true;
    } catch (error) {
        console.error('[Database] Update error:', error);
        return false;
    }
}

/**
 * Generic multipath update operation.
 * @param {Object} updates - Object with path-value pairs.
 * @returns {Promise<boolean>} True if successful.
 */
export async function updateMultipath(updates) {
    try {
        const dbRootRef = ref(db);
        await update(dbRootRef, updates);
        return true;
    } catch (error) {
        console.error('[Database] Multipath update error:', error);
        return false;
    }
}

/**
 * Generic delete operation.
 * @param {string} path - Database path to delete.
 * @returns {Promise<boolean>} True if successful.
 */
export async function deleteData(path) {
    try {
        const dataRef = ref(db, path);
        await remove(dataRef);
        return true;
    } catch (error) {
        console.error('[Database] Delete error:', error);
        return false;
    }
}

/**
 * Generic transaction operation.
 * @param {string} path - Database path for transaction.
 * @param {Function} transactionFunction - Transaction handler function.
 * @returns {Promise<Object>} Transaction result.
 */
export async function runDbTransaction(path, transactionFunction) {
    const dataRef = ref(db, path);
    return await runTransaction(dataRef, transactionFunction);
}

/**
 * Query data with filtering.
 * @param {string} path - Database path to query.
 * @param {string} orderBy - Field to order by.
 * @param {any} equalToValue - Value to filter by.
 * @returns {Promise<Array>} Array of matching results.
 */
export async function queryData(path, orderBy, equalToValue) {
    const dataRef = ref(db, path);
    const queryRef = query(dataRef, orderByChild(orderBy), equalTo(equalToValue));
    const snapshot = await get(queryRef);
    
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Array.isArray(data) ? data : Object.values(data);
    }
    return [];
}

/**
 * Cached read operation to reduce database calls.
 * @param {string} path - Database path to read.
 * @param {number} ttl - Time to live in milliseconds.
 * @returns {Promise<any>} Data at path or null.
 */
const cache = new Map();

export async function readDataWithCache(path, ttl = 60000) {
    const now = Date.now();
    const cached = cache.get(path);
    
    if (cached && (now - cached.timestamp) < ttl) {
        return cached.data;
    }
    
    const data = await readData(path);
    cache.set(path, { data, timestamp: now });
    return data;
}

/* ==========================================================================
   ONLINE STATUS TRACKING
   ========================================================================== */

/**
 * Set user as online
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function setUserOnline(userId) {
    try {
        const onlineRef = ref(db, `${PATHS.ONLINE}/${userId}`);
        const onlineData = {
            userId: userId,
            lastSeen: Date.now(),
            clubName: window.userProfile?.profile?.clubName || 'Unknown'
        };
        await set(onlineRef, onlineData);
        console.log('[Database] User set as online:', userId, onlineData.clubName);
        return true;
    } catch (error) {
        console.error('[Database] Error setting user online:', error);
        return false;
    }
}

/**
 * Set user as offline
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function setUserOffline(userId) {
    await remove(ref(db, `${PATHS.ONLINE}/${userId}`));
}

/**
 * Update user's last seen time (keep alive)
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function updateUserLastSeen(userId) {
    const onlineRef = ref(db, `${PATHS.ONLINE}/${userId}/lastSeen`);
    await set(onlineRef, Date.now());
}

/**
 * Get all online users
 * @returns {Promise<Array>} Array of online users
 */
export async function getOnlineUsers() {
    try {
        const onlineRef = ref(db, PATHS.ONLINE);
        const snapshot = await get(onlineRef);
        
        if (!snapshot.exists()) {
            console.log('[Database] No online users found');
            return [];
        }
        
        const onlineUsers = snapshot.val();
        const usersArray = Object.entries(onlineUsers)
            .map(([id, data]) => ({ id, ...data }));
        console.log('[Database] Online users found:', usersArray.length, usersArray);
        return usersArray;
    } catch (error) {
        console.error('[Database] Error getting online users:', error);
        return [];
    }
}

/**
 * Get user's squad data for multiplayer
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Squad data or null
 */
export async function getUserSquad(userId) {
    const userRef = ref(db, `${PATHS.USERS}/${userId}/squad`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) return null;
    
    return snapshot.val();
}

/**
 * Get user's club data for multiplayer
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Club data or null
 */
export async function getUserClub(userId) {
    const userRef = ref(db, `${PATHS.USERS}/${userId}/club`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) return null;
    
    return snapshot.val();
}

/**
 * Listen to online status changes
 * @param {Function} callback - Callback function with online users array
 * @returns {Function} Unsubscribe function
 */
export function listenToOnlineStatus(callback) {
    const onlineRef = ref(db, PATHS.ONLINE);
    
    const unsubscribe = onValue(onlineRef, (snapshot) => {
        if (snapshot.exists()) {
            const onlineUsers = snapshot.val();
            const usersArray = Object.entries(onlineUsers)
                .map(([id, data]) => ({ id, ...data }));
            callback(usersArray);
        } else {
            callback([]);
        }
    });
    
    return unsubscribe;
}

/* ==========================================================================
   MATCHMAKING & MATCH DATABASE OPERATIONS
   ========================================================================== */

/**
 * Add user to matchmaking queue
 * @param {string} userId - User ID
 * @param {string} matchType - 'ranked', 'unranked', or 'friend'
 * @param {Object} squadData - Squad information for matching
 * @returns {Promise<string>} Queue ID
 */
export async function joinMatchmakingQueue(userId, matchType, squadData) {
    const queueId = `${matchType}_${userId}_${Date.now()}`;
    const queueEntry = {
        userId: userId,
        matchType: matchType,
        timestamp: Date.now(),
        squadRating: squadData.rating || 75,
        squadSize: squadData.playerCount || 0,
        waitingForFriend: squadData.waitingForFriend || false,
        clubName: window.userProfile?.profile?.clubName || 'Unknown'
    };
    
    await set(ref(db, `${PATHS.MATCHMAKING_QUEUES}/${queueId}`), queueEntry);
    return queueId;
}

/**
 * Remove user from matchmaking queue
 * @param {string} queueId - Queue entry ID
 * @returns {Promise<void>}
 */
export async function leaveMatchmakingQueue(queueId) {
    await remove(ref(db, `${PATHS.MATCHMAKING_QUEUES}/${queueId}`));
}

/**
 * Get all users in a specific matchmaking queue
 * @param {string} matchType - 'ranked', 'unranked', or 'friend'
 * @returns {Promise<Array>} Array of queue entries
 */
export async function getMatchmakingQueue(matchType) {
    const queueRef = ref(db, PATHS.MATCHMAKING_QUEUES);
    const snapshot = await get(queueRef);
    
    if (!snapshot.exists()) return [];
    
    const queues = snapshot.val();
    return Object.entries(queues)
        .filter(([id, data]) => data.matchType === matchType)
        .map(([id, data]) => ({ id, ...data }));
}

/**
 * Find a match opponent
 * @param {string} userId - Current user ID
 * @param {string} matchType - Match type
 * @param {number} squadRating - User's squad rating
 * @returns {Promise<Object|null>} Opponent data or null
 */
export async function findMatchOpponent(userId, matchType, squadRating) {
    const queue = await getMatchmakingQueue(matchType);
    
    // Find opponent with similar rating (within 10 points)
    const opponents = queue.filter(entry => 
        entry.userId !== userId && 
        Math.abs(entry.squadRating - squadRating) <= 10
    );
    
    if (opponents.length === 0) return null;
    
    // Return the first available opponent
    return opponents[0];
}

/**
 * Create an active match
 * @param {string} homeUserId - Home team user ID
 * @param {string} awayUserId - Away team user ID
 * @param {string} matchType - Match type
 * @returns {Promise<string>} Match ID
 */
export async function createMatch(homeUserId, awayUserId, matchType) {
    const matchId = `match_${Date.now()}`;
    const matchData = {
        id: matchId,
        homeUserId: homeUserId,
        awayUserId: awayUserId,
        matchType: matchType,
        status: 'ready',
        timestamp: Date.now(),
        homeScore: 0,
        awayScore: 0
    };
    
    await set(ref(db, `${PATHS.ACTIVE_MATCHES}/${matchId}`), matchData);
    return matchId;
}

/**
 * Get match data
 * @param {string} matchId - Match ID
 * @returns {Promise<Object|null>} Match data or null
 */
export async function getMatchData(matchId) {
    const matchRef = ref(db, `${PATHS.ACTIVE_MATCHES}/${matchId}`);
    const snapshot = await get(matchRef);
    return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Update match score
 * @param {string} matchId - Match ID
 * @param {number} homeScore - Home team score
 * @param {number} awayScore - Away team score
 * @returns {Promise<void>}
 */
export async function updateMatchScore(matchId, homeScore, awayScore) {
    await update(ref(db, `${PATHS.ACTIVE_MATCHES}/${matchId}`), {
        homeScore: homeScore,
        awayScore: awayScore
    });
}

/**
 * Set match status
 * @param {string} matchId - Match ID
 * @param {string} status - New status ('ready', 'in_progress', 'completed')
 * @returns {Promise<void>}
 */
export async function setMatchStatus(matchId, status) {
    await update(ref(db, `${PATHS.ACTIVE_MATCHES}/${matchId}`), {
        status: status
    });
}

/**
 * Complete match and save results
 * @param {string} matchId - Match ID
 * @param {Object} results - Match results
 * @returns {Promise<void>}
 */
export async function completeMatch(matchId, results) {
    const matchData = await getMatchData(matchId);
    if (!matchData) return;
    
    // Update match with final results
    await update(ref(db, `${PATHS.ACTIVE_MATCHES}/${matchId}`), {
        status: 'completed',
        homeScore: results.homeScore,
        awayScore: results.awayScore,
        completedAt: Date.now(),
        results: results
    });
    
    // Update user stats
    await updateUserMatchStats(matchData.homeUserId, results.homeScore > results.awayScore, results);
    await updateUserMatchStats(matchData.awayUserId, results.awayScore > results.homeScore, results);
    
    // Archive match to user history
    await archiveMatchToHistory(matchData.homeUserId, matchId, results);
    await archiveMatchToHistory(matchData.awayUserId, matchId, results);
}

/**
 * Update user match statistics
 * @param {string} userId - User ID
 * @param {boolean} isWin - Whether the user won
 * @param {Object} results - Match results
 * @returns {Promise<void>}
 */
export async function updateUserMatchStats(userId, isWin, results) {
    const userRef = ref(db, `${PATHS.USERS}/${userId}/stats`);
    const snapshot = await get(userRef);
    
    const currentStats = snapshot.exists() ? snapshot.val() : {
        wins: 0,
        draws: 0,
        losses: 0,
        goalsScored: 0,
        goalsConceded: 0
    };
    
    const updates = {
        wins: currentStats.wins + (isWin ? 1 : 0),
        draws: currentStats.draws + (results.homeScore === results.awayScore ? 1 : 0),
        losses: currentStats.losses + (!isWin && results.homeScore !== results.awayScore ? 1 : 0),
        goalsScored: currentStats.goalsScored + (userId === results.homeUserId ? results.homeScore : results.awayScore),
        goalsConceded: currentStats.goalsConceded + (userId === results.homeUserId ? results.awayScore : results.homeScore)
    };
    
    await update(userRef, updates);
}

/**
 * Archive match to user history
 * @param {string} userId - User ID
 * @param {string} matchId - Match ID
 * @param {Object} results - Match results
 * @returns {Promise<void>}
 */
export async function archiveMatchToHistory(userId, matchId, results) {
    const historyRef = ref(db, `${PATHS.USERS}/${userId}/matchHistory/${matchId}`);
    await set(historyRef, {
        matchId: matchId,
        timestamp: Date.now(),
        results: results
    });
}

/**
 * Listen for match updates
 * @param {string} matchId - Match ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
export function listenToMatchUpdates(matchId, callback) {
    const matchRef = ref(db, `${PATHS.ACTIVE_MATCHES}/${matchId}`);
    return onValue(matchRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });
}

/**
 * Clean up old matchmaking queue entries
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {Promise<void>}
 */
export async function cleanupOldQueueEntries(maxAge = 300000) { // 5 minutes default
    const queueRef = ref(db, PATHS.MATCHMAKING_QUEUES);
    const snapshot = await get(queueRef);
    
    if (!snapshot.exists()) return;
    
    const queues = snapshot.val();
    const now = Date.now();
    const entriesToRemove = [];
    
    Object.entries(queues).forEach(([id, data]) => {
        if (now - data.timestamp > maxAge) {
            entriesToRemove.push(id);
        }
    });
    
    // Remove old entries
    for (const id of entriesToRemove) {
        await remove(ref(db, `${PATHS.MATCHMAKING_QUEUES}/${id}`));
    }
}