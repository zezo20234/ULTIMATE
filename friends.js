/* ==========================================================================
   FRIENDS SYSTEM
   Handles friend requests, friends list, and match invitations
   ========================================================================== */

import { db } from './firebase.js';
import { 
    ref, 
    set, 
    get, 
    update, 
    remove, 
    onValue 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const PATHS = {
    USERS: 'users',
    FRIEND_REQUESTS: 'friend_requests',
    FRIENDS: 'friends',
    MATCH_INVITES: 'match_invites'
};

/**
 * Send friend request
 * @param {string} fromId - Sender user ID
 * @param {string} toEmail - Recipient email
 * @returns {Promise<boolean>} Success or failure
 */
export async function sendFriendRequest(fromId, toEmail) {
    try {
        // Find user by email
        const usersRef = ref(db, PATHS.USERS);
        const snapshot = await get(usersRef);
        
        if (!snapshot.exists()) {
            console.error('[Friends] No users found');
            return false;
        }
        
        const users = snapshot.val();
        let toId = null;
        
        // Find user with matching email
        for (const [uid, userData] of Object.entries(users)) {
            if (userData.profile?.email === toEmail) {
                toId = uid;
                break;
            }
        }
        
        if (!toId) {
            console.error('[Friends] User not found with email:', toEmail);
            return false;
        }
        
        if (toId === fromId) {
            console.error('[Friends] Cannot send friend request to yourself');
            return false;
        }
        
        // Check if already friends
        const friendshipRef = ref(db, `${PATHS.FRIENDS}/${fromId}/${toId}`);
        const friendshipSnapshot = await get(friendshipRef);
        if (friendshipSnapshot.exists()) {
            console.error('[Friends] Already friends');
            return false;
        }
        
        // Create friend request
        const requestId = `request_${fromId}_${toId}_${Date.now()}`;
        const requestRef = ref(db, `${PATHS.FRIEND_REQUESTS}/${toId}/${requestId}`);
        
        await set(requestRef, {
            fromId: fromId,
            fromEmail: window.userProfile?.profile?.email || 'Unknown',
            toId: toId,
            status: 'pending',
            createdAt: Date.now()
        });
        
        console.log('[Friends] Friend request sent from', fromId, 'to', toId);
        return true;
    } catch (error) {
        console.error('[Friends] Error sending friend request:', error);
        return false;
    }
}

/**
 * Get friend requests for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of friend requests
 */
export async function getFriendRequests(userId) {
    try {
        const requestsRef = ref(db, `${PATHS.FRIEND_REQUESTS}/${userId}`);
        const snapshot = await get(requestsRef);
        
        if (!snapshot.exists()) return [];
        
        const requests = snapshot.val();
        return Object.entries(requests)
            .filter(([id, data]) => data.status === 'pending')
            .map(([id, data]) => ({ id, ...data }));
    } catch (error) {
        console.error('[Friends] Error getting friend requests:', error);
        return [];
    }
}

/**
 * Accept friend request
 * @param {string} userId - Current user ID
 * @param {string} fromId - Friend request sender ID
 * @returns {Promise<boolean>} Success or failure
 */
export async function acceptFriendRequest(userId, fromId) {
    try {
        // Add to both users' friends lists
        const updates = {};
        updates[`${PATHS.FRIENDS}/${userId}/${fromId}`] = {
            addedAt: Date.now(),
            status: 'friends'
        };
        updates[`${PATHS.FRIENDS}/${fromId}/${userId}`] = {
            addedAt: Date.now(),
            status: 'friends'
        };
        
        await update(ref(db), updates);
        
        // Remove the friend request
        const requestsRef = ref(db, `${PATHS.FRIEND_REQUESTS}/${userId}`);
        const snapshot = await get(requestsRef);
        
        if (snapshot.exists()) {
            const requests = snapshot.val();
            for (const [requestId, data] of Object.entries(requests)) {
                if (data.fromId === fromId && data.status === 'pending') {
                    await remove(ref(db, `${PATHS.FRIEND_REQUESTS}/${userId}/${requestId}`));
                }
            }
        }
        
        console.log('[Friends] Friend request accepted between', userId, 'and', fromId);
        return true;
    } catch (error) {
        console.error('[Friends] Error accepting friend request:', error);
        return false;
    }
}

/**
 * Decline friend request
 * @param {string} userId - Current user ID
 * @param {string} fromId - Friend request sender ID
 * @returns {Promise<boolean>} Success or failure
 */
export async function declineFriendRequest(userId, fromId) {
    try {
        const requestsRef = ref(db, `${PATHS.FRIEND_REQUESTS}/${userId}`);
        const snapshot = await get(requestsRef);
        
        if (snapshot.exists()) {
            const requests = snapshot.val();
            for (const [requestId, data] of Object.entries(requests)) {
                if (data.fromId === fromId && data.status === 'pending') {
                    await remove(ref(db, `${PATHS.FRIEND_REQUESTS}/${userId}/${requestId}`));
                }
            }
        }
        
        console.log('[Friends] Friend request declined from', fromId);
        return true;
    } catch (error) {
        console.error('[Friends] Error declining friend request:', error);
        return false;
    }
}

/**
 * Get friends list for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of friends
 */
export async function getFriends(userId) {
    try {
        const friendsRef = ref(db, `${PATHS.FRIENDS}/${userId}`);
        const snapshot = await get(friendsRef);
        
        if (!snapshot.exists()) return [];
        
        const friends = snapshot.val();
        const friendIds = Object.keys(friends);
        
        // Get friend details
        const friendsData = [];
        for (const friendId of friendIds) {
            const userRef = ref(db, `${PATHS.USERS}/${friendId}`);
            const userSnapshot = await get(userRef);
            
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                friendsData.push({
                    id: friendId,
                    clubName: userData.profile?.clubName || 'Unknown',
                    online: false // Will be updated by online status listener
                });
            }
        }
        
        return friendsData;
    } catch (error) {
        console.error('[Friends] Error getting friends list:', error);
        return [];
    }
}

/**
 * Send match invitation to friend
 * @param {string} fromId - Sender user ID
 * @param {string} toId - Recipient friend ID
 * @returns {Promise<boolean>} Success or failure
 */
export async function sendMatchInvite(fromId, toId) {
    try {
        const inviteId = `invite_${fromId}_${toId}_${Date.now()}`;
        const inviteRef = ref(db, `${PATHS.MATCH_INVITES}/${toId}/${inviteId}`);
        
        await set(inviteRef, {
            fromId: fromId,
            fromName: window.userProfile?.profile?.clubName || 'Unknown',
            toId: toId,
            status: 'pending',
            createdAt: Date.now()
        });
        
        console.log('[Friends] Match invite sent from', fromId, 'to', toId);
        return true;
    } catch (error) {
        console.error('[Friends] Error sending match invite:', error);
        return false;
    }
}

/**
 * Get match invitations for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of match invitations
 */
export async function getMatchInvites(userId) {
    try {
        const invitesRef = ref(db, `${PATHS.MATCH_INVITES}/${userId}`);
        const snapshot = await get(invitesRef);
        
        if (!snapshot.exists()) return [];
        
        const invites = snapshot.val();
        return Object.entries(invites)
            .filter(([id, data]) => data.status === 'pending')
            .map(([id, data]) => ({ id, ...data }));
    } catch (error) {
        console.error('[Friends] Error getting match invites:', error);
        return [];
    }
}

/**
 * Accept match invitation
 * @param {string} userId - Current user ID
 * @param {string} inviteId - Invitation ID
 * @returns {Promise<boolean>} Success or failure
 */
export async function acceptMatchInvite(userId, inviteId) {
    try {
        const inviteRef = ref(db, `${PATHS.MATCH_INVITES}/${userId}/${inviteId}`);
        const snapshot = await get(inviteRef);
        
        if (!snapshot.exists()) return false;
        
        const invite = snapshot.val();
        
        // Update invite status
        await update(inviteRef, { status: 'accepted' });
        
        // Start friend match with the inviter
        const { startFriendMatchFromInvite } = await import('./matchmaking.js');
        await startFriendMatchFromInvite(invite.fromId, invite.fromName);
        
        return true;
    } catch (error) {
        console.error('[Friends] Error accepting match invite:', error);
        return false;
    }
}

/**
 * Remove friend
 * @param {string} userId - Current user ID
 * @param {string} friendId - Friend ID to remove
 * @returns {Promise<boolean>} Success or failure
 */
export async function removeFriend(userId, friendId) {
    try {
        await remove(ref(db, `${PATHS.FRIENDS}/${userId}/${friendId}`));
        await remove(ref(db, `${PATHS.FRIENDS}/${friendId}/${userId}`));
        
        console.log('[Friends] Removed friend', friendId, 'from', userId);
        return true;
    } catch (error) {
        console.error('[Friends] Error removing friend:', error);
        return false;
    }
}