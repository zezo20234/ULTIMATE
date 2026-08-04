/* ==========================================================================
   PACKS & GACHA ENGINE
   Handles weighted probabilities, secure pack purchasing, and the premium
   DOM animation sequences for pack openings.
   ========================================================================== */

import { updateCoinsTransaction, addPlayersToClubAtomic } from './database.js';
import { generatePlayerInstance, getAllBasePlayers } from './players.js';
import { randomFloat, sleep } from './utils.js';

/**
 * Filters the global base player cache into pools based on rarity/rating.
 * This allows the Gacha algorithm to pick from specific buckets.
 * @param {Array} basePlayerCache - The master array of all game players.
 * @returns {Object} Grouped player pools.
 */
function createPlayerPools(basePlayerCache) {
    const pools = {
        bronze: [],
        silver: [],
        gold: [],
        rareGold: [],
        special: [] // TOTW, Icons, etc.
    };

    basePlayerCache.forEach(player => {
        const rarity = (player.rarity || 'gold').toLowerCase().trim();
        
        if (rarity.includes('bronze')) {
            pools.bronze.push(player);
        } else if (rarity.includes('silver')) {
            pools.silver.push(player);
        } else if (rarity === 'gold') {
            pools.gold.push(player);
        } else if (rarity === 'rare gold' || rarity === 'gold rare') {
            pools.rareGold.push(player);
        } else {
            pools.special.push(player); // Fallback for TOTW/Icon
        }
    });

    return pools;
}

/**
 * The core Gacha algorithm. Pulls a single player based on the pack's specific drop rates.
 * @param {Object} packOdds - The probability config (e.g., { gold: 80, rareGold: 15, special: 5 }).
 * @param {Object} pools - The categorized player pools.
 * @returns {Object} A selected base player definition.
 */
function rollForPlayer(packOdds, pools) {
    // Generate a random float between 0 and 100
    const roll = randomFloat(0, 100);
    let cumulative = 0;
    let selectedTier = 'gold'; // Default fallback

    // Iterate through odds to find where the roll landed
    for (const [tier, probability] of Object.entries(packOdds)) {
        cumulative += probability;
        if (roll <= cumulative) {
            selectedTier = tier;
            break;
        }
    }

    // Safety check: if the selected pool is empty, downgrade/upgrade gracefully
    let pool = pools[selectedTier];
    if (!pool || pool.length === 0) {
        console.warn(`[Gacha Engine] Pool for ${selectedTier} is empty! Falling back to Gold.`);
        pool = pools['gold']; 
    }

    // Pick a random player from the resolved pool
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
}

/**
 * Purchases and opens a pack for a user.
 * 1. Deducts coins securely via transaction.
 * 2. Rolls for X amount of items based on pack config.
 * 3. Generates unique instances.
 * 4. Saves them atomically to the user's club.
 * 
 * @param {string} uid - The Firebase User ID.
 * @param {Object} packConfig - Store pack configuration.
 * @returns {Promise<Object>} Result object { success, items, error }.
 */
export async function buyAndOpenPack(uid, packConfig) {
    try {
        if (!packConfig || !packConfig.cost || !packConfig.items) {
            throw new Error('Invalid pack configuration.');
        }

        // 1. Transaction: Deduct coins
        const paymentSuccess = await updateCoinsTransaction(uid, -packConfig.cost);
        if (!paymentSuccess) {
            return { success: false, items: [], error: 'Insufficient coins.' };
        }

        // 2. Prepare pools and roll for players
        const basePlayerCache = getAllBasePlayers();
        const pools = createPlayerPools(basePlayerCache);
        const pulledBasePlayers = [];
        
        for (let i = 0; i < packConfig.items; i++) {
            const basePlayer = rollForPlayer(packConfig.odds, pools);
            pulledBasePlayers.push(basePlayer);
        }

        // 3. Generate unique instances
        const pulledInstances = pulledBasePlayers.map(bp => generatePlayerInstance(bp));

        // 4. Save to Database Atomically
        await addPlayersToClubAtomic(uid, pulledInstances);

        return { success: true, items: pulledInstances, error: null };
    } catch (error) {
        console.error('[Packs API] Error processing pack purchase:', error);
        return { success: false, items: [], error: 'An error occurred during the pack opening.' };
    }
}

/* ==========================================================================
   ANIMATION & PRESENTATION
   ========================================================================== */

/**
 * Orchestrates the premium pack reveal animation sequence.
 * Handles the "Walkout" logic for players rated 86+.
 * 
 * @param {HTMLElement} container - The DOM element where the animation plays.
 * @param {Array<Object>} cards - The array of player instances pulled.
 * @param {Function} renderCardFn - The renderPlayerCard function from players.js.
 * @returns {Promise<void>} Resolves when the animation sequence is fully complete.
 */
export async function playPackAnimation(container, cards, renderCardFn) {
    // Clear container and set up the overlay
    container.innerHTML = '';
    container.style.display = 'flex';
    
    // Sort cards so the highest rated is revealed last (or first, depending on style)
    // Here we put the highest rated at index 0 to act as the "face" card of the pack
    const sortedCards = [...cards].sort((a, b) => b.rating - a.rating);
    const faceCard = sortedCards[0];
    
    // Determine if it's a Walkout (e.g., 86+ rating or Special card)
    const isWalkout = faceCard.rating >= 86 || faceCard.rarity === 'Icon' || faceCard.rarity === 'TOTW';

    // 1. Create the closed pack element
    const packElement = document.createElement('div');
    packElement.className = 'pack-opening-container';
    packElement.innerHTML = `
        <div class="pack-wrapper ${isWalkout ? 'glow-walkout' : 'glow-standard'}">
            <div class="pack-front">TAP TO OPEN</div>
        </div>
    `;
    container.appendChild(packElement);

    // Wait for user interaction to pop the pack
    await new Promise(resolve => {
        packElement.addEventListener('click', () => {
            packElement.classList.add('pack-opening-active');
            resolve();
        }, { once: true });
    });

    // 2. Play the opening phase
    // Wait for the CSS explosion animation to run its course
    await sleep(1500); 

    // 3. The Reveal Phase
    packElement.remove();
    const revealContainer = document.createElement('div');
    revealContainer.className = 'pack-reveal-container';
    container.appendChild(revealContainer);

    if (isWalkout) {
        // --- WALKOUT SEQUENCE ---
        // Show flares, nation, position, club, then player
        const walkoutDisplay = document.createElement('div');
        walkoutDisplay.className = 'walkout-sequence';
        revealContainer.appendChild(walkoutDisplay);

        // Step 1: Nation
        walkoutDisplay.innerHTML = `<h2 class="walkout-text slide-in">NATION: ${faceCard.nation || '???'}</h2>`;
        await sleep(1200);

        // Step 2: Position
        walkoutDisplay.innerHTML += `<h2 class="walkout-text slide-in delay-1">POSITION: ${faceCard.position}</h2>`;
        await sleep(1200);

        // Step 3: Club
        walkoutDisplay.innerHTML += `<h2 class="walkout-text slide-in delay-2">CLUB: ${faceCard.club || '???'}</h2>`;
        await sleep(1500);

        walkoutDisplay.remove();
    }

    // 4. Render the actual cards
    const cardGrid = document.createElement('div');
    cardGrid.className = 'pack-card-grid';
    revealContainer.appendChild(cardGrid);

    // Render cards sequentially with a slight delay for premium feel
    for (let i = 0; i < sortedCards.length; i++) {
        const cardDOM = renderCardFn(sortedCards[i], { showPrice: false });
        cardDOM.classList.add('card-pop-in');
        cardDOM.style.animationDelay = `${i * 0.15}s`;
        cardGrid.appendChild(cardDOM);
    }

    // Add a "Continue" button to exit the screen
    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn btn-primary mt-4 pop-in';
    continueBtn.style.animationDelay = '1.5s';
    continueBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Continue';
    continueBtn.addEventListener('click', () => {
        // Optional: Add "Send to Club" / "Quick Sell" logic here
        container.innerHTML = ''; // Clean up
    });
    revealContainer.appendChild(continueBtn);
}