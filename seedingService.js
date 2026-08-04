/* ==========================================================================
   DATABASE SEEDING SERVICE
   Initializes the game with starter data including market listings,
   AI clubs, and ensures the game feels alive from the start.
   ========================================================================== */

import { 
    getPlayerDatabase, 
    initializePlayerDatabase, 
    initializePackStore,
    updateMultipath,
    readData
} from './database.js';
import { generatePlayerInstance } from './players.js';
import { generateID, randomInt, randomChoice } from './utils.js';

/**
 * Seeds the database with initial data if it's empty.
 * This includes player database, pack store, market listings, and AI clubs.
 */
export async function seedDatabase() {
    console.log('[Seeding Service] Starting database initialization...');
    
    try {
        // 1. Initialize player database
        await seedPlayerDatabase();
        
        // 2. Initialize pack store
        await seedPackStore();
        
        // 3. Seed market with initial listings
        await seedMarketListings();
        
        // 4. Initialize AI clubs
        await seedAIClubs();
        
        console.log('[Seeding Service] Database initialization complete!');
        return true;
    } catch (error) {
        console.error('[Seeding Service] Error during seeding:', error);
        return false;
    }
}

/**
 * Ensures the player database is initialized with the local player data.
 */
async function seedPlayerDatabase() {
    console.log('[Seeding Service] Checking player database...');
    
    const existingPlayers = await getPlayerDatabase();
    
    if (!existingPlayers || existingPlayers.length === 0) {
        console.log('[Seeding Service] Player database empty, importing local data...');
        // Import the player database from the local file
        const { PLAYER_DATABASE } = await import('./playerDatabase.js');
        await initializePlayerDatabase(PLAYER_DATABASE);
        console.log(`[Seeding Service] Imported ${PLAYER_DATABASE.length} players to database.`);
    } else {
        console.log(`[Seeding Service] Player database already has ${existingPlayers.length} players.`);
    }
}

/**
 * Ensures the pack store is initialized with default packs.
 */
async function seedPackStore() {
    console.log('[Seeding Service] Checking pack store...');
    await initializePackStore();
}

/**
 * Seeds the transfer market with initial listings from AI clubs.
 * Creates a living market with various players at different price points.
 */
export async function seedMarketListings() {
    console.log('[Seeding Service] Seeding market listings...');
    
    try {
        // Check if market already has listings
        const marketData = await readData('market');
        const existingListings = marketData ? Object.keys(marketData).length : 0;
        
        if (existingListings > 100) {
            console.log(`[Seeding Service] Market already has ${existingListings} listings, skipping seed.`);
            return;
        }

        const players = await getPlayerDatabase();
        if (!players || players.length === 0) {
            console.log('[Seeding Service] No players available for market seeding.');
            return;
        }

        // Create 200 initial market listings for better market activity
        const updates = {};
        const listingCount = 200;

        for (let i = 0; i < listingCount; i++) {
            const player = randomChoice(players);
            const instance = generatePlayerInstance(player);
            
            // Vary pricing based on rarity and rating
            const basePrice = instance.marketPrice || calculateBasePrice(player);
            const priceVariation = 0.8 + (Math.random() * 0.4); // 80% to 120% of base
            const buyNowPrice = Math.floor(basePrice * priceVariation);
            const startPrice = Math.floor(buyNowPrice * 0.7);

            const listingId = generateID('list');
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

            updates[`market/${listingId}`] = {
                id: listingId,
                sellerId: `ai_club_${randomInt(1, 50)}`,
                sellerType: 'ai',
                player: instance,
                startPrice: startPrice,
                buyNowPrice: buyNowPrice,
                currentBid: 0,
                highestBidder: null,
                createdAt: Date.now(),
                expiresAt: expiresAt,
                status: 'active'
            };
        }

        await updateMultipath(updates);
        console.log(`[Seeding Service] Created ${listingCount} market listings.`);
    } catch (error) {
        console.error('[Seeding Service] Error seeding market:', error);
    }
}

/**
 * Calculates a base market price for a player based on their stats.
 */
function calculateBasePrice(player) {
    let base = 500;
    
    if (player.rarity.includes('Bronze')) base = 200;
    else if (player.rarity.includes('Silver')) base = 800;
    else if (player.rarity === 'Gold') base = 2000;
    else if (player.rarity === 'Rare Gold') base = 5000;
    else if (player.rarity === 'TOTW') base = 50000;
    else if (player.rarity === 'Icon') base = 500000;
    
    // Rating multiplier
    let multiplier = 1;
    if (player.rating >= 90) multiplier = 5;
    else if (player.rating >= 85) multiplier = 3;
    else if (player.rating >= 80) multiplier = 2;
    
    return Math.floor(base * multiplier);
}

/**
 * Seeds AI clubs that will participate in the market and provide opponents.
 */
async function seedAIClubs() {
    console.log('[Seeding Service] Seeding AI clubs...');
    
    try {
        // Check if AI clubs already exist
        const aiData = await readData('ai');
        const existingClubs = aiData ? Object.keys(aiData).length : 0;
        
        if (existingClubs > 100) {
            console.log(`[Seeding Service] AI clubs already exist (${existingClubs}), skipping seed.`);
            return;
        }

        const clubNames = [
            'FC Barcelona', 'Real Madrid', 'Manchester United', 'Bayern Munich', 'PSG',
            'Juventus', 'Chelsea', 'Liverpool', 'Manchester City', 'Arsenal',
            'Inter Milan', 'AC Milan', 'Dortmund', 'Ajax', 'Benfica',
            'Porto', 'Celtic', 'Rangers', 'Galatasaray', 'Fenerbahce',
            'Olympiacos', 'Panathinaikos', 'Shakhtar Donetsk', 'Dynamo Kyiv', 'Red Star Belgrade',
            'Partizan Belgrade', 'Steaua Bucuresti', 'Viktoria Plzen', 'Slavia Prague', 'Sparta Prague',
            'Lazio', 'Roma', 'Napoli', 'Atalanta', 'Fiorentina',
            'Sevilla', 'Valencia', 'Atletico Madrid', 'Real Sociedad', 'Villarreal',
            'Leverkusen', 'Leipzig', 'Wolfsburg', 'Frankfurt', 'Monchengladbach',
            'Tottenham', 'Everton', 'Newcastle', 'West Ham', 'Leicester',
            'Crystal Palace', 'Brighton', 'Aston Villa', 'Southampton', 'Wolves',
            'Brentford', 'Fulham', 'Nottingham Forest', 'Bournemouth', 'Luton Town',
            'Marseille', 'Lyon', 'Monaco', 'Nice', 'Rennes',
            'Atalanta', 'Bologna', 'Torino', 'Sassuolo', 'Udinese',
            'Real Betis', 'Real Valladolid', 'Getafe', 'Alaves', 'Celta Vigo',
            'Schalke', 'Werder Bremen', 'Freiburg', 'Mainz', 'Augsburg',
            'Feyenoord', 'PSV Eindhoven', 'AZ Alkmaar', 'Twente', 'Utrecht',
            'Sporting CP', 'Braga', 'Vitoria Guimaraes', 'Famalicao', 'Boavista',
            'Athletic Bilbao', 'Real Sociedad', 'Osasuna', 'Mallorca', 'Las Palmas'
        ];

        const players = await getPlayerDatabase();
        if (!players || players.length === 0) {
            console.log('[Seeding Service] No players available for AI club seeding.');
            return;
        }

        const updates = {};

        clubNames.forEach((clubName, index) => {
            const clubId = `ai_club_${index + 1}`;
            
            // Generate a squad for each AI club
            const squad = generateAISquad(players, clubName);
            
            updates[`ai/${clubId}`] = {
                id: clubId,
                name: clubName,
                squad: squad,
                coins: 50000 + randomInt(0, 100000), // Random coin balance
                strategy: randomChoice(['balanced', 'attacking', 'defensive']),
                lastActivity: Date.now()
            };
        });

        await updateMultipath(updates);
        console.log(`[Seeding Service] Created ${clubNames.length} AI clubs.`);
    } catch (error) {
        console.error('[Seeding Service] Error seeding AI clubs:', error);
    }
}

/**
 * Generates a complete squad for an AI club.
 */
function generateAISquad(players, clubName) {
    const positions = {
        GK: 1,
        CB: 2,
        LB: 1,
        RB: 1,
        CDM: 2,
        CM: 2,
        CAM: 1,
        LW: 1,
        RW: 1,
        ST: 2
    };

    const squad = [];
    const usedPlayers = new Set();

    // Filter players by club name if possible, otherwise use all players
    let availablePlayers = players.filter(p => p.club === clubName);
    if (availablePlayers.length < 11) {
        availablePlayers = players; // Fallback to all players
    }

    // Fill each position
    Object.entries(positions).forEach(([position, count]) => {
        for (let i = 0; i < count; i++) {
            // Find players for this position
            const positionPlayers = availablePlayers.filter(p => {
                const playerPos = p.position.toUpperCase();
                const targetPos = position.toUpperCase();
                
                if (playerPos === targetPos) return true;
                if (targetPos === 'ST' && ['ST', 'CF', 'LW', 'RW'].includes(playerPos)) return true;
                if (targetPos === 'CM' && ['CM', 'CAM', 'CDM'].includes(playerPos)) return true;
                if (targetPos === 'CB' && ['CB', 'LB', 'RB'].includes(playerPos)) return true;
                
                return false;
            });

            // Filter out already used players
            const available = positionPlayers.filter(p => !usedPlayers.has(p.id));
            
            if (available.length > 0) {
                // Pick a random player, preferring higher-rated ones
                const sorted = available.sort((a, b) => b.rating - a.rating);
                const selected = sorted[randomInt(0, Math.min(4, sorted.length - 1))];
                usedPlayers.add(selected.id);
                squad.push(generatePlayerInstance(selected));
            } else {
                // Fallback: any available player
                const remaining = availablePlayers.filter(p => !usedPlayers.has(p.id));
                if (remaining.length > 0) {
                    const selected = randomChoice(remaining);
                    usedPlayers.add(selected.id);
                    squad.push(generatePlayerInstance(selected));
                }
            }
        }
    });

    return squad;
}

/**
 * Starts the AI market activity system.
 * AI clubs will periodically list players on the market and buy players.
 */
export function startAIMarketActivity() {
    console.log('[Seeding Service] Starting AI market activity...');
    
    // Run every 2 minutes (more frequent for more listings)
    const interval = 2 * 60 * 1000;
    
    setInterval(async () => {
        try {
            await performAIMarketActivity();
        } catch (error) {
            console.error('[Seeding Service] Error in AI market activity:', error);
        }
    }, interval);
}

/**
 * Performs AI market activity - listing and buying players.
 */
async function performAIMarketActivity() {
    console.log('[Seeding Service] Performing AI market activity...');
    
    try {
        // 1. Random AI clubs list players on market
        await aiListPlayers();
        
        // 2. Random AI clubs buy players from market
        await aiBuyPlayers();
        
        console.log('[Seeding Service] AI market activity complete.');
    } catch (error) {
        console.error('[Seeding Service] Error in AI market activity:', error);
    }
}

/**
 * AI clubs list random players on the market.
 */
async function aiListPlayers() {
    const aiData = await readData('ai');
    if (!aiData) return;

    const aiClubs = Object.values(aiData);
    const numClubsToAct = Math.min(30, aiClubs.length); // 30 clubs act each cycle (increased from 10)
    const actingClubs = [];

    // Select random clubs
    while (actingClubs.length < numClubsToAct) {
        const club = randomChoice(aiClubs);
        if (!actingClubs.includes(club)) {
            actingClubs.push(club);
        }
    }

    const updates = {};

    for (const club of actingClubs) {
        // Each club lists 3-6 players (increased from 2-5)
        const numListings = randomInt(3, 6);
        
        for (let i = 0; i < numListings; i++) {
            if (club.squad && club.squad.length > 0) {
                const player = randomChoice(club.squad);
                const instance = generatePlayerInstance(player);
                
                const basePrice = instance.marketPrice || calculateBasePrice(player);
                const buyNowPrice = Math.floor(basePrice * (0.9 + Math.random() * 0.2));
                const startPrice = Math.floor(buyNowPrice * 0.7);

                const listingId = generateID('list');
                const expiresAt = Date.now() + (6 * 60 * 60 * 1000); // 6 hours

                updates[`market/${listingId}`] = {
                    id: listingId,
                    sellerId: club.id,
                    sellerType: 'ai',
                    player: instance,
                    startPrice: startPrice,
                    buyNowPrice: buyNowPrice,
                    currentBid: 0,
                    highestBidder: null,
                    createdAt: Date.now(),
                    expiresAt: expiresAt,
                    status: 'active'
                };
            }
        }
    }

    if (Object.keys(updates).length > 0) {
        await updateMultipath(updates);
        console.log(`[Seeding Service] AI clubs listed ${Object.keys(updates).length} players.`);
    }
}

/**
 * AI clubs buy players from the market.
 */
async function aiBuyPlayers() {
    const marketData = await readData('market');
    if (!marketData) return;

    const listings = Object.values(marketData).filter(l => l.status === 'active' && l.sellerType !== 'ai');
    if (listings.length === 0) return;

    const aiData = await readData('ai');
    if (!aiData) return;

    const aiClubs = Object.values(aiData);
    const numBuyers = Math.min(2, aiClubs.length);
    const buyingClubs = [];

    // Select random clubs with enough coins
    while (buyingClubs.length < numBuyers) {
        const club = randomChoice(aiClubs);
        if (club.coins > 10000 && !buyingClubs.includes(club)) {
            buyingClubs.push(club);
        }
    }

    const updates = {};

    for (const club of buyingClubs) {
        // Each club tries to buy 1 player
        const affordableListings = listings.filter(l => l.buyNowPrice <= club.coins);
        
        if (affordableListings.length > 0) {
            // Prefer higher-rated players
            const sorted = affordableListings.sort((a, b) => b.player.rating - a.player.rating);
            const listing = randomChoice(sorted.slice(0, 5)); // Top 5, random choice
            
            // Execute purchase
            updates[`market/${listing.id}/status`] = 'sold';
            updates[`market/${listing.id}/buyerId`] = club.id;
            updates[`market/${listing.id}/soldAt`] = Date.now();
            
            // Deduct coins from AI club
            updates[`ai/${club.id}/coins`] = club.coins - listing.buyNowPrice;
            
            // Pay the seller if it's a real user (not AI)
            if (listing.sellerType === 'user') {
                const sellerId = listing.sellerId;
                const sellerCoins = await readData(`users/${sellerId}/economy/coins`);
                updates[`users/${sellerId}/economy/coins`] = (sellerCoins || 0) + listing.buyNowPrice;
                console.log(`[Seeding Service] Paying seller ${sellerId} ${listing.buyNowPrice} coins`);
            }
            
            console.log(`[Seeding Service] AI club ${club.name} bought ${listing.player.name} for ${listing.buyNowPrice} coins.`);
        }
    }

    if (Object.keys(updates).length > 0) {
        await updateMultipath(updates);
    }
}

/**
 * Cleans up expired market listings.
 */
export async function cleanupExpiredListings() {
    console.log('[Seeding Service] Cleaning up expired listings...');
    
    try {
        const marketData = await readData('market');
        if (!marketData) return;

        const updates = {};
        const now = Date.now();
        let cleanedCount = 0;

        Object.entries(marketData).forEach(([listingId, listing]) => {
            if (listing.status === 'active' && listing.expiresAt < now) {
                // Return player to seller if it's a user
                if (listing.sellerType === 'user') {
                    updates[`users/${listing.sellerId}/club/${listing.player.instanceId}`] = listing.player;
                }
                
                // Mark as expired
                updates[`market/${listingId}/status`] = 'expired';
                cleanedCount++;
            }
        });

        if (Object.keys(updates).length > 0) {
            await updateMultipath(updates);
            console.log(`[Seeding Service] Cleaned up ${cleanedCount} expired listings.`);
        }
    } catch (error) {
        console.error('[Seeding Service] Error cleaning up listings:', error);
    }
}

/**
 * Runs periodic cleanup tasks.
 */
export function startMaintenanceTasks() {
    console.log('[Seeding Service] Starting maintenance tasks...');
    
    // Run cleanup every hour
    const interval = 60 * 60 * 1000;
    
    setInterval(async () => {
        try {
            await cleanupExpiredListings();
        } catch (error) {
            console.error('[Seeding Service] Error in maintenance:', error);
        }
    }, interval);
}