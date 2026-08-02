/* ==========================================================================
   ULTIMATE TEAM - FOOTBALL MANAGER & TRADING SIMULATOR
   FILE: players.js
   DESCRIPTION: Master Player Engine & Data Model. Handles player card creation,
   stat calculations, default player database, search/filtering, dynamic rating 
   computations, and HTML card DOM rendering.
   ========================================================================== */

const PlayerManager = {
    // Master database of initial preset players across all rarity tiers
    basePlayerDatabase: [
        // Special / Icon Tier (90+)
        { id: "ply_icn_01", name: "Lionel Messi", position: "RW", rating: 93, pace: 85, shooting: 92, passing: 91, dribbling: 95, defending: 35, physical: 65, nation: "Argentina", club: "Inter Miami", rarity: "Special", basePrice: 850000 },
        { id: "ply_icn_02", name: "Cristiano Ronaldo", position: "ST", rating: 91, pace: 87, shooting: 93, passing: 78, dribbling: 85, defending: 34, physical: 77, nation: "Portugal", club: "Al Nassr", rarity: "Special", basePrice: 720000 },
        { id: "ply_icn_03", name: "Kylian Mbappé", position: "ST", rating: 92, pace: 97, shooting: 89, passing: 80, dribbling: 92, defending: 36, physical: 78, nation: "France", club: "Real Madrid", rarity: "Special", basePrice: 950000 },
        { id: "ply_icn_04", name: "Erling Haaland", position: "ST", rating: 91, pace: 89, shooting: 93, passing: 66, dribbling: 80, defending: 45, physical: 88, nation: "Norway", club: "Manchester City", rarity: "Special", basePrice: 880000 },
        { id: "ply_icn_05", name: "Kevin De Bruyne", position: "CM", rating: 91, pace: 72, shooting: 88, passing: 94, dribbling: 87, defending: 65, physical: 78, nation: "Belgium", club: "Manchester City", rarity: "Special", basePrice: 650000 },

        // Gold Tier (75 - 89)
        { id: "ply_gld_01", name: "Mohamed Salah", position: "RW", rating: 89, pace: 89, shooting: 87, passing: 81, dribbling: 88, defending: 45, physical: 75, nation: "Egypt", club: "Liverpool", rarity: "Gold", basePrice: 180000 },
        { id: "ply_gld_02", name: "Jude Bellingham", position: "CAM", rating: 88, pace: 80, shooting: 82, passing: 84, dribbling: 87, defending: 78, physical: 83, nation: "England", club: "Real Madrid", rarity: "Gold", basePrice: 220000 },
        { id: "ply_gld_03", name: "Virgil van Dijk", position: "CB", rating: 89, pace: 78, shooting: 60, passing: 71, dribbling: 72, defending: 89, physical: 86, nation: "Netherlands", club: "Liverpool", rarity: "Gold", basePrice: 250000 },
        { id: "ply_gld_04", name: "Vinícius Júnior", position: "LW", rating: 89, pace: 95, shooting: 82, passing: 78, dribbling: 90, defending: 29, physical: 68, nation: "Brazil", club: "Real Madrid", rarity: "Gold", basePrice: 310000 },
        { id: "ply_gld_05", name: "Rodri", position: "CDM", rating: 89, pace: 58, shooting: 73, passing: 85, dribbling: 80, defending: 87, physical: 85, nation: "Spain", club: "Manchester City", rarity: "Gold", basePrice: 140000 },
        { id: "ply_gld_06", name: "Bukayo Saka", position: "RW", rating: 86, pace: 85, shooting: 80, passing: 82, dribbling: 86, defending: 65, physical: 69, nation: "England", club: "Arsenal", rarity: "Gold", basePrice: 95000 },
        { id: "ply_gld_07", name: "Lautaro Martínez", position: "ST", rating: 87, pace: 82, shooting: 86, passing: 73, dribbling: 84, defending: 48, physical: 84, nation: "Argentina", club: "Inter Milan", rarity: "Gold", basePrice: 85000 },
        { id: "ply_gld_08", name: "Alisson Becker", position: "GK", rating: 89, pace: 86, shooting: 85, passing: 85, dribbling: 89, defending: 54, physical: 90, nation: "Brazil", club: "Liverpool", rarity: "Gold", basePrice: 160000 },

        // Silver Tier (65 - 74)
        { id: "ply_slv_01", name: "Archie Gray", position: "CM", rating: 73, pace: 75, shooting: 62, passing: 72, dribbling: 74, defending: 70, physical: 71, nation: "England", club: "Tottenham", rarity: "Silver", basePrice: 2500 },
        { id: "ply_slv_02", name: "Claudio Echeverri", position: "CAM", rating: 71, pace: 78, shooting: 68, passing: 70, dribbling: 77, defending: 38, physical: 55, nation: "Argentina", club: "River Plate", rarity: "Silver", basePrice: 1800 },
        { id: "ply_slv_03", name: "Jobe Bellingham", position: "CM", rating: 70, pace: 72, shooting: 67, passing: 69, dribbling: 71, defending: 65, physical: 73, nation: "England", club: "Sunderland", rarity: "Silver", basePrice: 1500 },
        { id: "ply_slv_04", name: "Lewis Miley", position: "CM", rating: 72, pace: 70, shooting: 64, passing: 73, dribbling: 73, defending: 68, physical: 70, nation: "England", club: "Newcastle", rarity: "Silver", basePrice: 2100 },

        // Bronze Tier (45 - 64)
        { id: "ply_brz_01", name: "Ethan Nwaneri", position: "CAM", rating: 64, pace: 74, shooting: 60, passing: 63, dribbling: 67, defending: 42, physical: 52, nation: "England", club: "Arsenal", rarity: "Bronze", basePrice: 450 },
        { id: "ply_brz_02", name: "Rio Ngumoha", position: "LW", rating: 62, pace: 80, shooting: 55, passing: 58, dribbling: 68, defending: 30, physical: 48, nation: "England", club: "Liverpool", rarity: "Bronze", basePrice: 350 },
        { id: "ply_brz_03", name: "Chris Rigg", position: "CM", rating: 63, pace: 68, shooting: 58, passing: 62, dribbling: 65, defending: 59, physical: 62, nation: "England", club: "Sunderland", rarity: "Bronze", basePrice: 400 }
    ],

    /**
     * Calculates card overall rating weighted by position emphasis.
     * @param {Object} stats - Object with stats (pace, shooting, passing, dribbling, defending, physical)
     * @param {string} position - Player position (e.g. ST, CM, CB, GK)
     * @returns {number} Calculated overall rating (clamped 45-99)
     */
    calculateOverall(stats, position) {
        let ovr = 0;
        const p = position ? position.toUpperCase() : "CM";

        if (p === 'ST' || p === 'CF') {
            ovr = (stats.shooting * 0.45) + (stats.pace * 0.25) + (stats.dribbling * 0.15) + (stats.physical * 0.15);
        } else if (p === 'LW' || p === 'RW' || p === 'LM' || p === 'RM') {
            ovr = (stats.pace * 0.35) + (stats.dribbling * 0.30) + (stats.passing * 0.20) + (stats.shooting * 0.15);
        } else if (p === 'CAM' || p === 'CM') {
            ovr = (stats.passing * 0.35) + (stats.dribbling * 0.25) + (stats.shooting * 0.20) + (stats.physical * 0.20);
        } else if (p === 'CDM' || p === 'CB') {
            ovr = (stats.defending * 0.40) + (stats.physical * 0.35) + (stats.passing * 0.15) + (stats.pace * 0.10);
        } else if (p === 'LB' || p === 'RB') {
            ovr = (stats.pace * 0.30) + (stats.defending * 0.30) + (stats.physical * 0.20) + (stats.passing * 0.20);
        } else {
            // Default GK / Universal formula
            ovr = (stats.defending * 0.3) + (stats.physical * 0.3) + (stats.passing * 0.2) + (stats.pace * 0.2);
        }

        return window.Utils ? window.Utils.clamp(Math.round(ovr), 45, 99) : Math.round(ovr);
    },

    /**
     * Creates a new dynamic player object with unique instance ID.
     * @param {Object} baseData - Base stats override
     * @returns {Object} Complete player object
     */
    createPlayer(baseData = {}) {
        const template = window.Utils ? window.Utils.randomChoice(this.basePlayerDatabase) : this.basePlayerDatabase[0];
        const player = window.Utils ? window.Utils.deepCopy({ ...template, ...baseData }) : Object.assign({}, template, baseData);

        // Assign unique dynamic instance ID
        player.instanceId = window.Utils ? window.Utils.generateId("card_") : "card_" + Date.now();
        player.acquiredAt = Date.now();
        player.contracts = 28;
        player.fitness = 100;
        player.rarity = window.Utils ? window.Utils.calculateCardRarity(player.rating) : "Gold";
        player.quickSellValue = window.Utils ? window.Utils.calculateQuickSellValue(player.rating) : 300;

        return player;
    },

    /**
     * Filters a list of players by search query, position, rarity, and rating bounds.
     * @param {Array<Object>} players - List of player objects
     * @param {Object} filters - Filter criteria
     * @returns {Array<Object>} Filtered players
     */
    filterPlayers(players, filters = {}) {
        if (!players || !Array.isArray(players)) return [];

        return players.filter(player => {
            if (!player) return false;

            // Search Query (Name, Club, Nation)
            if (filters.query) {
                const q = filters.query.toLowerCase();
                const matchName = player.name ? player.name.toLowerCase().includes(q) : false;
                const matchClub = player.club ? player.club.toLowerCase().includes(q) : false;
                const matchNation = player.nation ? player.nation.toLowerCase().includes(q) : false;
                if (!matchName && !matchClub && !matchNation) return false;
            }

            // Position Filter
            if (filters.position && filters.position !== "ALL") {
                if (player.position !== filters.position) return false;
            }

            // Rarity Filter
            if (filters.rarity && filters.rarity !== "ALL") {
                if (player.rarity !== filters.rarity) return false;
            }

            // Rating Bounds
            if (filters.minRating && player.rating < filters.minRating) return false;
            if (filters.maxRating && player.rating > filters.maxRating) return false;

            return true;
        });
    },

    /**
     * Renders standard HTML player card template string.
     * @param {Object} player - Player object
     * @param {Object} options - Custom actions (e.g. showSellBtn)
     * @returns {string} HTML markup string
     */
    renderCardHTML(player, options = {}) {
        if (!player) return `<div class="empty-card-slot">Empty Slot</div>`;

        const rarityClass = (player.rarity || 'Gold').toLowerCase();
        const rarityColor = window.Utils ? window.Utils.getRarityColor(player.rarity) : "#ffb700";
        const sanitizedName = window.Utils ? window.Utils.sanitizeInput(player.name) : player.name;
        const sanitizedClub = window.Utils ? window.Utils.sanitizeInput(player.club || 'Free Agent') : (player.club || 'Free Agent');

        return `
            <div class="player-card card-${rarityClass}" data-instance-id="${player.instanceId || ''}" style="border-color: ${rarityColor}">
                <div class="card-header">
                    <div class="card-rating-box">
                        <span class="card-rating">${player.rating}</span>
                        <span class="card-position">${player.position}</span>
                    </div>
                    <div class="card-nation">${player.nation || 'World'}</div>
                </div>
                <div class="card-info">
                    <h4 class="card-name">${sanitizedName}</h4>
                    <span class="card-club">${sanitizedClub}</span>
                </div>
                <div class="card-stats">
                    <div class="stat-col">
                        <span><strong>${player.pace || 50}</strong> PAC</span>
                        <span><strong>${player.shooting || 50}</strong> SHO</span>
                        <span><strong>${player.passing || 50}</strong> PAS</span>
                    </div>
                    <div class="stat-col">
                        <span><strong>${player.dribbling || 50}</strong> DRI</span>
                        <span><strong>${player.defending || 50}</strong> DEF</span>
                        <span><strong>${player.physical || 50}</strong> PHY</span>
                    </div>
                </div>
                ${options.showSellBtn ? `
                    <button class="btn-card-action btn-sell" onclick="TransferMarketManager.openListModal('${player.instanceId}')">
                        List Card
                    </button>
                ` : ''}
            </div>
        `;
    }
};

// Expose PlayerManager globally
window.PlayerManager = PlayerManager;
