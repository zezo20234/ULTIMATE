/* ==========================================================================
   ULTIMATE TEAM - FOOTBALL MANAGER & TRADING SIMULATOR
   FILE: database.js
   DESCRIPTION: Data Access Layer (DAL) for Firebase Realtime Database.
   Provides modular wrappers for CRUD operations, transactions, real-time
   listeners, and safe error handling without UI dependencies.
   ========================================================================== */

const DatabaseManager = {
    // Active Realtime Listeners Registry (Path -> Callback)
    activeListeners: new Map(),

    /**
     * Reads data once from a specific database path.
     * @param {string} path - Database reference path
     * @returns {Promise<any>} Snapshotted value or null if non-existent
     */
    async read(path) {
        try {
            const snapshot = await window.db.ref(path).once('value');
            return snapshot.exists() ? snapshot.val() : null;
        } catch (error) {
            console.error(`Database Read Error at [${path}]:`, error);
            throw error;
        }
    },

    /**
     * Writes/Overwrites data at a given path.
     * @param {string} path - Database reference path
     * @param {any} data - Object or primitive data to set
     * @returns {Promise<void>}
     */
    async write(path, data) {
        try {
            await window.db.ref(path).set(data);
        } catch (error) {
            console.error(`Database Write Error at [${path}]:`, error);
            throw error;
        }
    },

    /**
     * Updates specific child nodes at a path without replacing full object.
     * @param {string} path - Base database path
     * @param {Object} data - Key-value map of updates to apply
     * @returns {Promise<void>}
     */
    async update(path, data) {
        try {
            await window.db.ref(path).update(data);
        } catch (error) {
            console.error(`Database Update Error at [${path}]:`, error);
            throw error;
        }
    },

    /**
     * Removes a node at a given path.
     * @param {string} path - Database reference path to delete
     * @returns {Promise<void>}
     */
    async remove(path) {
        try {
            await window.db.ref(path).remove();
        } catch (error) {
            console.error(`Database Delete Error at [${path}]:`, error);
            throw error;
        }
    },

    /**
     * Generates a new auto-key and pushes data into a collection.
     * @param {string} path - Database collection path
     * @param {any} data - Item data to append
     * @returns {Promise<string>} Generated unique key
     */
    async push(path, data) {
        try {
            const newRef = window.db.ref(path).push();
            await newRef.set(data);
            return newRef.key;
        } catch (error) {
            console.error(`Database Push Error at [${path}]:`, error);
            throw error;
        }
    },

    /**
     * Attaches a real-time listener to a database path.
     * @param {string} path - Database path to observe
     * @param {Function} callback - Triggered with updated snapshot data
     * @returns {Function} Unsubscribe function
     */
    listen(path, callback) {
        const ref = window.db.ref(path);
        const listener = ref.on('value', (snapshot) => {
            const val = snapshot.exists() ? snapshot.val() : null;
            callback(val);
        }, (error) => {
            console.error(`Database Realtime Listener Error at [${path}]:`, error);
        });

        this.activeListeners.set(path, { ref, listener });

        // Return Unsubscribe Function
        return () => this.off(path);
    },

    /**
     * Detaches an active real-time listener from a path.
     * @param {string} path - Database path to stop listening to
     */
    off(path) {
        if (this.activeListeners.has(path)) {
            const { ref, listener } = this.activeListeners.get(path);
            ref.off('value', listener);
            this.activeListeners.delete(path);
        }
    },

    /**
     * Detaches all active listeners registered across the application.
     */
    detachAllListeners() {
        this.activeListeners.forEach(({ ref, listener }) => {
            ref.off('value', listener);
        });
        this.activeListeners.clear();
    },

    /**
     * Executes an atomic database transaction.
     * Ensures race-condition safety for economy, trades, and coins.
     * @param {string} path - Path to perform transaction on
     * @param {Function} updateFn - Mutator function receives current val, returns new val
     * @returns {Promise<any>} Result snapshot
     */
    async transaction(path, updateFn) {
        try {
            const result = await window.db.ref(path).transaction((currentVal) => {
                return updateFn(currentVal);
            });
            return result;
        } catch (error) {
            console.error(`Database Transaction Failed at [${path}]:`, error);
            throw error;
        }
    },

    /**
     * Safely increments or decrements a numeric value atomically.
     * @param {string} path - Numeric path (e.g., users/uid/coins)
     * @param {number} amount - Positive or negative integer delta
     */
    async increment(path, amount) {
        return this.transaction(path, (currentVal) => {
            return (Number(currentVal) || 0) + Number(amount);
        });
    }
};

// Expose DatabaseManager globally
window.DatabaseManager = DatabaseManager;
