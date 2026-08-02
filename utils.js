/* ==========================================================================
   ULTIMATE TEAM - FOOTBALL MANAGER & TRADING SIMULATOR
   FILE: utils.js
   DESCRIPTION: Global Utility & Helper Functions. Provides DRY helper routines
   for formatting, random number generation, deep copying, calculations,
   ID generation, and input sanitization.
   ========================================================================== */

const Utils = {
    /**
     * Formats raw coin values into localized comma-separated strings.
     * @param {number} amount - Numeric coin amount
     * @returns {string} Formatted string (e.g., "1,250,000")
     */
    formatCoins(amount) {
        const num = Number(amount) || 0;
        return num.toLocaleString('en-US');
    },

    /**
     * Shortens large currency numbers for tight UI widgets.
     * @param {number} num - Raw number
     * @returns {string} Shortened string (e.g., "1.5M", "250K")
     */
    formatCompactNumber(num) {
        const n = Number(num) || 0;
        if (n >= 1000000) {
            return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (n >= 1000) {
            return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return n.toString();
    },

    /**
     * Formats Unix timestamp into readable date string.
     * @param {number} timestamp - Epoch timestamp in milliseconds
     * @returns {string} Formatted date string
     */
    formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Generates a unique cryptographically safe random ID string.
     * @param {string} prefix - Optional prefix (e.g. 'ply_', 'mkt_')
     * @returns {string} Unique ID
     */
    generateId(prefix = '') {
        const randomPart = Math.random().toString(36).substring(2, 11);
        const timePart = Date.now().toString(36);
        return `${prefix}${timePart}_${randomPart}`;
    },

    /**
     * Generates an integer within an inclusive range [min, max].
     * @param {number} min - Lower bound
     * @param {number} max - Upper bound
     * @returns {number} Random integer
     */
    randomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * Generates a floating point number within range [min, max].
     * @param {number} min - Lower bound
     * @param {number} max - Upper bound
     * @param {number} decimals - Precision places
     * @returns {number} Random float
     */
    randomFloat(min, max, decimals = 2) {
        const rand = Math.random() * (max - min) + min;
        const power = Math.pow(10, decimals);
        return Math.floor(rand * power) / power;
    },

    /**
     * Picks a single random element from an array.
     * @param {Array} array - Target array
     * @returns {any} Picked item
     */
    randomChoice(array) {
        if (!array || array.length === 0) return null;
        const index = Math.floor(Math.random() * array.length);
        return array[index];
    },

    /**
     * Weighted random selection algorithm for pack probabilities & AI decisions.
     * @param {Array<any>} items - Available items
     * @param {Array<number>} weights - Corresponding numerical weights
     * @returns {any} Selected item
     */
    randomWeightedChoice(items, weights) {
        if (!items.length || items.length !== weights.length) return null;
        
        let totalWeight = weights.reduce((acc, w) => acc + w, 0);
        let randomNum = Math.random() * totalWeight;

        for (let i = 0; i < items.length; i++) {
            if (randomNum < weights[i]) {
                return items[i];
            }
            randomNum -= weights[i];
        }
        return items[items.length - 1];
    },

    /**
     * Performs a deep clone of objects/arrays to break memory references.
     * @param {T} obj - Object to copy
     * @returns {T} Cloned object
     */
    deepCopy(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Clamps a numerical value within strict bounds.
     * @param {number} val - Input value
     * @param {number} min - Minimum allowed
     * @param {number} max - Maximum allowed
     * @returns {number} Clamped value
     */
    clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    },

    /**
     * Determines player card rarity tier based on overall rating.
     * @param {number} rating - Player overall rating (45-99)
     * @returns {string} Rarity tier: "Bronze", "Silver", "Gold", or "Special"
     */
    calculateCardRarity(rating) {
        const r = Number(rating) || 45;
        if (r >= 90) return 'Special';
        if (r >= 75) return 'Gold';
        if (r >= 65) return 'Silver';
        return 'Bronze';
    },

    /**
     * Returns color HEX hex code corresponding to card rarity tier.
     * @param {string} rarity - "Bronze", "Silver", "Gold", "Special"
     * @returns {string} HEX color string
     */
    getRarityColor(rarity) {
        switch (rarity) {
            case 'Special': return '#00e5ff';
            case 'Gold': return '#ffb700';
            case 'Silver': return '#a8b8c8';
            case 'Bronze': default: return '#8c533e';
        }
    },

    /**
     * Calculates default card quick sell value derived from rating and rarity.
     * @param {number} rating - Player overall rating
     * @returns {number} Coin value
     */
    calculateQuickSellValue(rating) {
        const r = Number(rating) || 45;
        if (r >= 90) return 10000;
        if (r >= 85) return 2500;
        if (r >= 80) return 700;
        if (r >= 75) return 300;
        if (r >= 65) return 100;
        return 30;
    },

    /**
     * Calculates default minimum / maximum listing bounds for transfer market.
     * @param {number} basePrice - Estimated market price
     * @returns {{ minPrice: number, maxPrice: number }} Price range
     */
    calculatePriceBounds(basePrice) {
        const base = Number(basePrice) || 500;
        return {
            minPrice: Math.max(200, Math.floor(base * 0.5)),
            maxPrice: Math.floor(base * 3.0)
        };
    },

    /**
     * Prevents XSS script insertion by escaping text inputs.
     * @param {string} str - Raw input string
     * @returns {string} Sanitized text
     */
    sanitizeInput(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, (match) => {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return map[match];
        }).trim();
    },

    /**
     * Creates a debounced version of a function for user search inputs.
     * @param {Function} func - Function to execute
     * @param {number} wait - Delay in milliseconds
     * @returns {Function} Debounced closure
     */
    debounce(func, wait = 300) {
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
};

// Expose Utils globally
window.Utils = Utils;
