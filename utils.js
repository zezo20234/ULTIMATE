/* ==========================================================================
   UTILITY FUNCTIONS
   Contains all shared helper logic for formatting, math, and timers.
   ========================================================================== */

/**
 * Formats a number as an integer with commas (e.g., 1250000 -> "1,250,000").
 * Used primarily for coin balances.
 * @param {number} amount - The amount to format.
 * @returns {string} The formatted coin string.
 */
export function formatCoins(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return "0";
    return Math.floor(amount).toLocaleString('en-US');
}

/**
 * Formats a number with shorthand suffixes (e.g., 1500000 -> "1.5M", 15000 -> "15K").
 * Useful for tight UI spaces like the transfer market.
 * @param {number} num - The number to format.
 * @returns {string} The shorthand formatted string.
 */
export function formatPriceShort(num) {
    if (num === undefined || num === null || isNaN(num)) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

/**
 * Restricts a value to be within a specified range.
 * @param {number} val - The value to clamp.
 * @param {number} min - The minimum allowable value.
 * @param {number} max - The maximum allowable value.
 * @returns {number} The clamped value.
 */
export function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

/**
 * Generates a random integer between min and max (inclusive).
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} A random integer.
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a random float between min and max.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} A random float.
 */
export function randomFloat(min, max) {
    return (Math.random() * (max - min)) + min;
}

/**
 * Selects a random element from an array.
 * @param {Array} arr - The array to select from.
 * @returns {*} The randomly selected element.
 */
export function randomChoice(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns true with a probability of `percentage` out of 100.
 * @param {number} percentage - The chance (0-100) of returning true.
 * @returns {boolean} True if the roll succeeds.
 */
export function rollChance(percentage) {
    return Math.random() * 100 < percentage;
}

/**
 * Linearly interpolates between two values.
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Interpolation factor (0-1).
 * @returns {number} The interpolated value.
 */
export function lerp(a, b, t) {
    return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Calculates the Euclidean distance between two 2D points.
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @returns {number} Distance.
 */
export function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Randomizes the order of elements in an array (Fisher-Yates shuffle).
 * @param {Array} arr - The array to shuffle.
 * @returns {Array} A new shuffled array.
 */
export function shuffleArray(arr) {
    const newArr = [...arr];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
}

/**
 * Creates a deep copy of an object or array to prevent mutation references.
 * @param {Object|Array} obj - The object to copy.
 * @returns {Object|Array} The deeply copied object.
 */
export function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Generates a unique, collision-resistant string ID.
 * Useful for player instances, market listings, and match IDs.
 * @param {string} prefix - Optional prefix (e.g., 'ply', 'list').
 * @returns {string} The unique ID.
 */
export function generateID(prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}${randomPart}`;
}

/**
 * Asynchronous sleep/delay function.
 * Allows pausing execution in async functions without freezing the browser.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function to limit how often a function can fire.
 * Useful for search inputs and rapid button clicking.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function to guarantee execution at a regular interval.
 * @param {Function} func - The function to throttle.
 * @param {number} limit - The limit in milliseconds.
 * @returns {Function} The throttled function.
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

/**
 * Calculates the final amount after EA/Market tax is applied.
 * @param {number} price - The original sale price.
 * @param {number} taxRate - The tax percentage (e.g., 5 for 5%).
 * @returns {number} The integer amount the seller receives.
 */
export function calculateAfterTax(price, taxRate = 5) {
    const multiplier = 1 - (taxRate / 100);
    return Math.floor(price * multiplier);
}

/**
 * Maps a player's rarity string to the corresponding CSS class for rendering.
 * @param {string} rarity - The string rarity (e.g., "Rare Gold").
 * @returns {string} The CSS class name.
 */
export function getCardRarityClass(rarity) {
    if (!rarity) return 'rarity-gold';
    
    const formatted = rarity.toLowerCase().trim();
    switch(formatted) {
        case 'bronze': return 'rarity-bronze';
        case 'silver': return 'rarity-silver';
        case 'gold': return 'rarity-gold';
        case 'gold rare':
        case 'rare gold': return 'rarity-rare-gold';
        case 'totw': return 'rarity-totw';
        case 'icon': return 'rarity-icon';
        default: return 'rarity-gold';
    }
}

/**
 * Validates an email format using regex.
 * @param {string} email - The email to test.
 * @returns {boolean} True if valid.
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/* ==========================================================================
   RANK SYSTEM - 10 RANK LADDER (100 POINTS PER RANK)
   ========================================================================== */

/**
 * Converts rank points to football-style rank label (10-rank system).
 * @param {number} points - Rank points (0-999)
 * @returns {string} Football-style rank label
 */
export function getRankFromPoints(points) {
    if (points >= 900) return 'ZA Champion';
    if (points >= 800) return 'Mythic';
    if (points >= 700) return 'Ultimate';
    if (points >= 600) return 'Champion';
    if (points >= 500) return 'Legendary';
    if (points >= 400) return 'Elite';
    if (points >= 300) return 'World Class';
    if (points >= 200) return 'Professional';
    if (points >= 100) return 'Semi-Pro';
    return 'Amateur';
}

/**
 * Gets the rank tier number from points (0-9).
 * @param {number} points - Rank points (0-999)
 * @returns {number} Rank tier (0-9)
 */
export function getRankTier(points) {
    return Math.min(Math.floor(points / 100), 9);
}

/**
 * Gets the rank points required for a specific rank tier.
 * @param {number} tier - Rank tier (0-9)
 * @returns {number} Points required for that tier
 */
export function getPointsForTier(tier) {
    return tier * 100;
}

/**
 * Gets the rank points required for a specific rank label.
 * @param {string} rank - The rank label
 * @returns {number} Points required
 */
export function getPointsForRank(rank) {
    const rankMap = {
        'Amateur': 0,
        'Semi-Pro': 100,
        'Professional': 200,
        'World Class': 300,
        'Elite': 400,
        'Legendary': 500,
        'Champion': 600,
        'Ultimate': 700,
        'Mythic': 800,
        'ZA Champion': 900
    };
    return rankMap[rank] || 0;
}

/**
 * Gets points remaining until next rank promotion.
 * @param {number} points - Current rank points
 * @returns {number} Points needed for next rank (0 if at max rank)
 */
export function getPointsToNextRank(points) {
    if (points >= 900) return 0; // Max rank
    const nextTier = Math.floor(points / 100) + 1;
    return (nextTier * 100) - points;
}

/**
 * Gets points progress within current rank (0-99).
 * @param {number} points - Current rank points
 * @returns {number} Progress within current rank
 */
export function getRankProgress(points) {
    return points % 100;
}

/**
 * Gets CSS class for rank styling.
 * @param {string} rank - The rank label
 * @returns {string} CSS class name
 */
export function getRankClass(rank) {
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

/**
 * Generates a random room code for friend matches.
 * @returns {string} 6-character alphanumeric code
 */
export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
