/* ==========================================================================
   PLAYER DATA & RENDERING ENGINE
   Handles player definitions, instance generation, filtering, sorting,
   and DOM rendering for Ultimate Team cards.
   ========================================================================== */

import { PLAYER_DATABASE } from './playerDatabase.js';
import { getPlayerDatabase, initializePlayerDatabase } from './database.js';
import { generateID, getCardRarityClass, formatCoins, deepCopy } from './utils.js';

// In-memory cache to prevent constant database reads for base player definitions
let basePlayerCache = [];
let isPlayerDBLoaded = false;

/**
 * Loads the master player database from Firebase or local cache.
 * @returns {Promise<boolean>} True if loaded successfully.
 */
export async function loadPlayerDatabase() {
    if (isPlayerDBLoaded) return true;
    
    try {
        // First try to load from Firebase
        const firebasePlayers = await getPlayerDatabase();
        if (firebasePlayers && firebasePlayers.length > 0) {
            basePlayerCache = firebasePlayers;
            isPlayerDBLoaded = true;
            console.log(`[Player Engine] Loaded ${basePlayerCache.length} base players from Firebase.`);
            return true;
        }
        
        // If Firebase is empty, initialize with local database
        console.log('[Player Engine] Firebase player database empty, initializing with local data...');
        basePlayerCache = PLAYER_DATABASE;
        isPlayerDBLoaded = true;
        
        // Initialize Firebase with local data
        await initializePlayerDatabase(PLAYER_DATABASE);
        
        console.log(`[Player Engine] Loaded ${basePlayerCache.length} base players from local database.`);
        return true;
    } catch (error) {
        console.error('[Player Engine] Failed to load player database:', error);
        
        // Fallback to local database
        basePlayerCache = PLAYER_DATABASE;
        isPlayerDBLoaded = true;
        console.log(`[Player Engine] Fallback: Loaded ${basePlayerCache.length} base players from local database.`);
        return true;
    }
}

/**
 * Retrieves a base player definition by their ID.
 * @param {string} definitionId - The ID of the base player.
 * @returns {Object|null} The base player object or null.
 */
export function getBasePlayer(definitionId) {
    return basePlayerCache.find(p => p.id === definitionId) || null;
}

/**
 * Gets all base players in the cache.
 * @returns {Array<Object>} Array of all base players.
 */
export function getAllBasePlayers() {
    return basePlayerCache;
}

/**
 * Calculates the Quick Sell value of a card based on its rating and rarity.
 * This ensures a stable minimum floor for the game's economy.
 * @param {number} rating - Player rating (1-99).
 * @param {string} rarity - Player rarity string.
 * @returns {number} The quick sell coin value.
 */
export function calculateQuickSellValue(rating, rarity) {
    let baseValue = 0;
    const r = rarity.toLowerCase().trim();

    if (r.includes('bronze')) baseValue = 15;
    else if (r.includes('silver')) baseValue = 100;
    else if (r === 'gold') baseValue = 300;
    else if (r === 'rare gold' || r === 'gold rare') baseValue = 600;
    else if (r === 'totw') baseValue = 9750;
    else if (r === 'icon') baseValue = 65000;
    else baseValue = 100;

    // Apply a rating multiplier to reward higher rated cards within the same tier
    let multiplier = 1;
    if (rating >= 90) multiplier = 2.5;
    else if (rating >= 85) multiplier = 1.5;
    else if (rating >= 80) multiplier = 1.2;

    return Math.floor(baseValue * multiplier);
}

/**
 * Generates a unique, owned instance of a player card for a user's club or market.
 * Used during pack openings, market purchases, or admin grants.
 * @param {string|Object} basePlayerOrId - The base player ID or object.
 * @returns {Object} A unique player instance object.
 */
export function generatePlayerInstance(basePlayerOrId) {
    let basePlayer = null;
    if (typeof basePlayerOrId === 'string') {
        basePlayer = getBasePlayer(basePlayerOrId);
    } else {
        basePlayer = basePlayerOrId;
    }

    if (!basePlayer) {
        throw new Error('[Player Engine] Cannot generate instance: Base player not found.');
    }

    const instance = deepCopy(basePlayer);
    
    // Attach unique instance metadata
    instance.instanceId = generateID('card');
    instance.issuedAt = Date.now();
    instance.isUntradeable = false; // Default logic, can be modified for special packs
    instance.quickSellValue = calculateQuickSellValue(instance.rating, instance.rarity);
    instance.gamesPlayed = 0;
    instance.goals = 0;
    instance.assists = 0;
    instance.yellowCards = 0;
    instance.redCards = 0;

    return instance;
}

/**
 * Creates the DOM Element for a player card based on the premium CSS structure.
 * @param {Object} player - The player instance or base definition.
 * @param {Object} options - Configuration for rendering (e.g., small size, show prices).
 * @param {boolean} options.showPrice - If true, adds price tag beneath the card.
 * @param {number} options.price - The market price to display.
 * @param {Function} options.onClick - Click event handler.
 * @returns {HTMLElement} The fully constructed DOM element representing the card.
 */
export function renderPlayerCard(player, options = {}) {
    const card = document.createElement('div');
    const rarityClass = getCardRarityClass(player.rarity);
    card.className = `ut-card ${rarityClass}`;
    card.dataset.instanceId = player.instanceId || player.id;
    card.dataset.defId = player.id; // Definition ID
    card.dataset.rating = player.rating; // Rating for CSS effects

    if (options.onClick && typeof options.onClick === 'function') {
        card.addEventListener('click', () => options.onClick(player));
    }

    // SVG silhouette is applied via CSS, but structure remains
    card.innerHTML = `
        <div class="ut-card-top">
            <div class="ut-card-info">
                <div class="ut-card-rating">${player.rating}</div>
                <div class="ut-card-pos">${player.position}</div>
                <!-- Nation & Club placeholders for chemistry links later -->
                <div class="ut-card-nation" title="${player.nation || 'Nation'}"></div>
                <div class="ut-card-club" title="${player.club || 'Club'}"></div>
            </div>
            <div class="ut-card-avatar"></div>
        </div>
        <div class="ut-card-bottom">
            <div class="ut-card-name">${player.name}</div>
            <div class="ut-card-stats">
                <div class="stat-item"><span class="stat-lbl">PAC</span> <span class="stat-val">${player.pace || 0}</span></div>
                <div class="stat-item"><span class="stat-lbl">DRI</span> <span class="stat-val">${player.dribbling || 0}</span></div>
                <div class="stat-item"><span class="stat-lbl">SHO</span> <span class="stat-val">${player.shooting || 0}</span></div>
                <div class="stat-item"><span class="stat-lbl">DEF</span> <span class="stat-val">${player.defending || 0}</span></div>
                <div class="stat-item"><span class="stat-lbl">PAS</span> <span class="stat-val">${player.passing || 0}</span></div>
                <div class="stat-item"><span class="stat-lbl">PHY</span> <span class="stat-val">${player.physical || 0}</span></div>
            </div>
        </div>
    `;

    // Wrap in a container if price needs to be displayed (e.g., Transfer Market view)
    if (options.showPrice) {
        const wrapper = document.createElement('div');
        wrapper.className = 'market-item';
        wrapper.appendChild(card);
        
        const priceDiv = document.createElement('div');
        priceDiv.className = 'market-item-prices';
        priceDiv.innerHTML = `
            <div><span>Price:</span> <strong><i class="fa-solid fa-coins"></i> ${formatCoins(options.price || 0)}</strong></div>
        `;
        wrapper.appendChild(priceDiv);
        return wrapper;
    }

    return card;
}

/**
 * Filters an array of player objects based on robust criteria.
 * @param {Array<Object>} players - The array of players to filter.
 * @param {Object} filters - Filter criteria.
 * @param {string} filters.name - Name search string.
 * @param {string} filters.position - Position string (e.g., 'ST', 'CB', or broad 'ATT', 'DEF').
 * @param {string} filters.rarity - Rarity string.
 * @param {number} filters.minRating - Minimum overall rating.
 * @param {number} filters.maxRating - Maximum overall rating.
 * @returns {Array<Object>} Filtered array.
 */
export function filterPlayers(players, filters = {}) {
    if (!players || players.length === 0) return [];

    return players.filter(p => {
        // Name Filter - Case insensitive and remove accents
        if (filters.name && filters.name !== '') {
            const searchName = filters.name.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
            const playerName = p.name.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
            
            if (!playerName.includes(searchName)) {
                return false;
            }
        }

        // Rarity Filter
        if (filters.rarity && filters.rarity !== '' && filters.rarity !== 'ALL') {
            if (p.rarity !== filters.rarity) return false;
        }

        // Rating Filters
        if (filters.minRating && p.rating < filters.minRating) return false;
        if (filters.maxRating && p.rating > filters.maxRating) return false;

        // Position Filter (Supports specific 'ST' or broad 'ATT' grouping)
        if (filters.position && filters.position !== 'ALL' && filters.position !== '') {
            const pos = filters.position.toUpperCase();
            const playerPos = p.position.toUpperCase();
            
            // Exact match
            if (playerPos === pos) return true;
            
            // Broad position groups
            if (pos === 'ATT' && ['ST', 'CF', 'LW', 'RW'].includes(playerPos)) return true;
            if (pos === 'MID' && ['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(playerPos)) return true;
            if (pos === 'DEF' && ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(playerPos)) return true;
            if (pos === 'GK' && playerPos === 'GK') return true;
            
            return false;
        }

        return true;
    });
}

/**
 * Sorts an array of players based on the specified criteria.
 * @param {Array<Object>} players - The array of players to sort.
 * @param {string} sortBy - Sort criteria ('rating', 'name', 'pace', etc.).
 * @param {string} order - 'asc' or 'desc'.
 * @returns {Array<Object>} Sorted array.
 */
export function sortPlayers(players, sortBy = 'rating', order = 'desc') {
    if (!players || players.length === 0) return [];

    const sorted = [...players].sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
            case 'rating':
                comparison = b.rating - a.rating;
                break;
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'pace':
                comparison = (b.pace || 0) - (a.pace || 0);
                break;
            case 'shooting':
                comparison = (b.shooting || 0) - (a.shooting || 0);
                break;
            case 'passing':
                comparison = (b.passing || 0) - (a.passing || 0);
                break;
            case 'dribbling':
                comparison = (b.dribbling || 0) - (a.dribbling || 0);
                break;
            case 'defending':
                comparison = (b.defending || 0) - (a.defending || 0);
                break;
            case 'physical':
                comparison = (b.physical || 0) - (a.physical || 0);
                break;
            case 'price':
                comparison = (b.marketPrice || 0) - (a.marketPrice || 0);
                break;
            default:
                comparison = b.rating - a.rating;
        }
        
        return order === 'asc' ? -comparison : comparison;
    });

    return sorted;
}

/**
 * Searches for players based on multiple criteria with pagination.
 * @param {Object} filters - Filter criteria.
 * @param {string} sortBy - Sort criteria.
 * @param {string} order - Sort order.
 * @param {number} page - Page number (1-indexed).
 * @param {number} itemsPerPage - Items per page.
 * @returns {Object} Object containing results and pagination info.
 */
export function searchPlayers(filters = {}, sortBy = 'rating', order = 'desc', page = 1, itemsPerPage = 20) {
    let filtered = filterPlayers(basePlayerCache, filters);
    filtered = sortPlayers(filtered, sortBy, order);
    
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedResults = filtered.slice(startIndex, endIndex);
    
    return {
        results: paginatedResults,
        pagination: {
            page,
            itemsPerPage,
            totalItems,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        }
    };
}

/**
 * Gets a list of all unique nations in the database.
 * @returns {Array<string>} Array of nation names.
 */
export function getUniqueNations() {
    const nations = new Set();
    basePlayerCache.forEach(p => {
        if (p.nation) nations.add(p.nation);
    });
    return Array.from(nations).sort();
}

/**
 * Gets a list of all unique clubs in the database.
 * @returns {Array<string>} Array of club names.
 */
export function getUniqueClubs() {
    const clubs = new Set();
    basePlayerCache.forEach(p => {
        if (p.club) clubs.add(p.club);
    });
    return Array.from(clubs).sort();
}

/**
 * Gets a list of all unique leagues in the database.
 * @returns {Array<string>} Array of league names.
 */
export function getUniqueLeagues() {
    const leagues = new Set();
    basePlayerCache.forEach(p => {
        if (p.league) leagues.add(p.league);
    });
    return Array.from(leagues).sort();
}

/**
 * Gets a list of all unique positions in the database.
 * @returns {Array<string>} Array of position names.
 */
export function getUniquePositions() {
    const positions = new Set();
    basePlayerCache.forEach(p => {
        if (p.position) positions.add(p.position);
    });
    return Array.from(positions).sort();
}

/**
 * Gets a list of all unique rarities in the database.
 * @returns {Array<string>} Array of rarity names.
 */
export function getUniqueRarities() {
    const rarities = new Set();
    basePlayerCache.forEach(p => {
        if (p.rarity) rarities.add(p.rarity);
    });
    return Array.from(rarities).sort();
}