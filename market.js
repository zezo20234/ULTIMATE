/* ==========================================================================
   TRANSFER MARKET ENGINE
   Handles bidding, buy-it-now snipes, secure client-side transactions, 
   pagination, and resolving expired auctions.
   ========================================================================== */

import { db } from './firebase.js';
import { updateCoinsTransaction, getMarketTaxRate } from './database.js';
import { calculateAfterTax } from './utils.js';
import { 
    ref, 
    get, 
    update, 
    runTransaction, 
    query, 
    orderByChild, 
    equalTo 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

/**
 * Places a bid on an active market listing.
 * Secure flow: Deduct coins -> Try to lock listing -> If fail, refund -> If win, refund previous bidder.
 * 
 * @param {string} uid - The Firebase User ID of the bidder.
 * @param {string} listingId - The unique ID of the market listing.
 * @param {number} bidAmount - The amount of coins being bid.
 * @returns {Promise<Object>} { success, error, message }
 */
export async function placeBid(uid, listingId, bidAmount) {
    try {
        const listingRef = ref(db, `market/${listingId}`);
        const snapshot = await get(listingRef);
        
        if (!snapshot.exists()) throw new Error("Listing does not exist.");
        const listingInfo = snapshot.val();

        if (listingInfo.sellerId === uid) throw new Error("You cannot bid on your own listing.");
        if (listingInfo.status !== 'active') throw new Error("This listing is no longer active.");
        if (listingInfo.expiresAt < Date.now()) throw new Error("This listing has expired.");
        if (bidAmount <= listingInfo.currentBid || bidAmount < listingInfo.startPrice) {
            throw new Error("Bid amount is too low.");
        }

        // 1. Deduct coins from the new bidder first to ensure they can afford it
        const paymentSuccess = await updateCoinsTransaction(uid, -bidAmount);
        if (!paymentSuccess) throw new Error("Insufficient coins.");

        let previousBidderId = null;
        let previousBidAmount = 0;

        // 2. Transaction to securely update the listing
        const transactionResult = await runTransaction(listingRef, (listing) => {
            if (listing) {
                // Double check conditions inside the transaction lock
                if (listing.status !== 'active' || listing.expiresAt < Date.now()) return; // Abort
                if (bidAmount <= listing.currentBid) return; // Abort, someone bid higher while we were processing

                // Save previous bidder data to refund them later
                if (listing.highestBidder) {
                    previousBidderId = listing.highestBidder;
                    previousBidAmount = listing.currentBid;
                }

                // Apply new bid
                listing.currentBid = bidAmount;
                listing.highestBidder = uid;
                return listing;
            }
            return listing;
        });

        // 3. Handle transaction outcome
        if (!transactionResult.committed) {
            // Someone else locked it or conditions changed. Refund our initial deduction.
            await updateCoinsTransaction(uid, bidAmount);
            return { success: false, error: "Bid failed. The listing changed or someone bid higher." };
        }

        // 4. We won the bid slot! Refund the previous bidder if there was one.
        if (previousBidderId && previousBidderId !== uid) {
            await updateCoinsTransaction(previousBidderId, previousBidAmount);
        }

        return { success: true, message: "Bid placed successfully!" };
    } catch (error) {
        console.error("[Market Engine] Bid Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Purchases a player instantly at their Buy Now price.
 * Secure flow: Deduct coins -> Lock listing as 'sold' -> Transfer item -> Pay seller.
 * 
 * @param {string} uid - The Firebase User ID of the buyer.
 * @param {string} listingId - The unique ID of the market listing.
 * @returns {Promise<Object>} { success, error, player }
 */
export async function buyNow(uid, listingId) {
    try {
        const listingRef = ref(db, `market/${listingId}`);
        const snapshot = await get(listingRef);
        
        if (!snapshot.exists()) throw new Error("Listing does not exist.");
        const listingData = snapshot.val();

        if (listingData.sellerId === uid) throw new Error("You cannot buy your own listing.");
        if (listingData.status !== 'active') throw new Error("This item has already been sold.");
        if (listingData.expiresAt < Date.now()) throw new Error("This listing has expired.");
        if (!listingData.buyNowPrice) throw new Error("This item does not have a Buy Now price.");

        const cost = listingData.buyNowPrice;

        // 1. Deduct coins from buyer
        const paymentSuccess = await updateCoinsTransaction(uid, -cost);
        if (!paymentSuccess) throw new Error("Insufficient coins.");

        let previousBidderId = null;
        let previousBidAmount = 0;

        // 2. Lock the listing and mark as sold
        const txResult = await runTransaction(listingRef, (listing) => {
            if (listing) {
                if (listing.status !== 'active' || listing.expiresAt < Date.now()) return; // Abort
                
                if (listing.highestBidder) {
                    previousBidderId = listing.highestBidder;
                    previousBidAmount = listing.currentBid;
                }

                listing.status = 'sold';
                listing.buyerId = uid;
                listing.soldAt = Date.now();
                return listing;
            }
            return listing;
        });

        // 3. Handle transaction outcome
        if (!txResult.committed) {
            // Someone sniped it milliseconds before us. Refund our deduction.
            await updateCoinsTransaction(uid, cost);
            return { success: false, error: "Item was bought by someone else." };
        }

        // 4. Success! Proceed with transfers.
        const playerInstance = listingData.player;
        const taxRate = await getMarketTaxRate();
        const payout = calculateAfterTax(cost, taxRate);

        // A. Add player to buyer's club
        const buyerClubRef = ref(db);
        const clubUpdates = {};
        clubUpdates[`users/${uid}/club/${playerInstance.instanceId}`] = playerInstance;
        await update(buyerClubRef, clubUpdates);

        // B. Refund any existing bidder who lost the item
        if (previousBidderId) {
            await updateCoinsTransaction(previousBidderId, previousBidAmount);
        }

        // C. Pay the seller (only if it's a real user, AI sellers don't need coins)
        if (listingData.sellerType === 'user') {
            await updateCoinsTransaction(listingData.sellerId, payout);
            console.log(`[Market Engine] Paid seller ${listingData.sellerId} ${payout} coins`);
        }

        return { success: true, player: playerInstance, message: "Item purchased successfully!" };
    } catch (error) {
        console.error("[Market Engine] Buy Now Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Searches and paginates the active transfer market.
 * Because Firebase RTDB filtering is basic, we fetch active items and perform 
 * advanced filtering (Name, Rating, Position) in memory.
 * 
 * @param {Object} filters - Filter criteria (name, minPrice, maxPrice, position, etc.)
 * @param {string} sortBy - Sort criteria ('time-desc', 'price-asc', etc.)
 * @param {number} page - Current page number (1-indexed).
 * @param {number} itemsPerPage - Number of items per page.
 * @returns {Promise<Object>} { results: Array, totalPages: number, totalItems: number }
 */
export async function searchMarket(filters = {}, sortBy = 'time-asc', page = 1, itemsPerPage = 12) {
    const marketRef = ref(db, 'market');
    const activeQuery = query(marketRef, orderByChild('status'), equalTo('active'));
    const snapshot = await get(activeQuery);
    
    let activeListings = [];
    
    if (snapshot.exists()) {
        const now = Date.now();
        snapshot.forEach(child => {
            const item = child.val();
            // Skip expired listings
            if (item.expiresAt > now) {
                activeListings.push(item);
            }
        });
    }

    // Apply filters in memory
    let filtered = activeListings.filter(listing => {
        const player = listing.player;
        
        // Name filter
        if (filters.name && !player.name.toLowerCase().includes(filters.name.toLowerCase())) {
            return false;
        }
        
        // Position filter
        if (filters.position && filters.position !== 'ALL') {
            const pos = filters.position.toUpperCase();
            const playerPos = player.position.toUpperCase();
            
            if (pos === 'ATT' && !['ST', 'CF', 'LW', 'RW'].includes(playerPos)) return false;
            if (pos === 'MID' && !['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(playerPos)) return false;
            if (pos === 'DEF' && !['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(playerPos)) return false;
            if (pos === 'GK' && playerPos !== 'GK') return false;
            if (pos !== 'ATT' && pos !== 'MID' && pos !== 'DEF' && pos !== 'GK' && playerPos !== pos) return false;
        }
        
        // Rarity filter
        if (filters.rarity && filters.rarity !== 'ALL' && player.rarity !== filters.rarity) {
            return false;
        }
        
        // Rating filter
        if (filters.minRating && player.rating < filters.minRating) return false;
        
        // Price filter
        if (filters.maxPrice && listing.buyNowPrice > filters.maxPrice) return false;
        
        return true;
    });

    // Sort results
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'price-asc':
                return a.buyNowPrice - b.buyNowPrice;
            case 'price-desc':
                return b.buyNowPrice - a.buyNowPrice;
            case 'rating-desc':
                return b.player.rating - a.player.rating;
            case 'rating-asc':
                return a.player.rating - b.player.rating;
            case 'time-asc':
            default:
                return a.expiresAt - b.expiresAt;
        }
    });

    // Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedResults = filtered.slice(startIndex, endIndex);

    return {
        results: paginatedResults,
        totalPages: totalPages,
        totalItems: totalItems,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
    };
}