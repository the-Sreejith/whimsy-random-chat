// backend/server.js
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow frontend (restrict in production!)
        methods: ["GET", "POST"]
    }
});

// --- Redis Setup ---
console.log(`Connecting to Redis`);
const redis = createClient({ url: process.env.REDIS_URL });

redis.on('error', (err) => console.error('Redis Client Error', err));

async function connectRedis() {
    try {
        await redis.connect();
        console.log('Redis connected successfully.');
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
        // Optional: Exit if Redis connection is critical
        // process.exit(1);
    }
}
connectRedis(); // Connect asynchronously

const WAITING_LIST = 'whimsy:waitingUsers'; // Using a prefix is good practice
const userPartners = new Map(); // Stores socket.id -> partner socket.id

// --- Helper Functions ---
const notifyPartner = (socketId, event, payload) => {
    const partnerId = userPartners.get(socketId);
    if (partnerId) {
        io.to(partnerId).emit(event, payload);
        // console.log(`Event '${event}' sent from ${socketId} to ${partnerId}`); // Verbose logging
    } else {
        // console.log(`Event '${event}' not sent from ${socketId}: No partner found.`); // Verbose logging
    }
};

const cleanupUser = async (socketId) => {
    console.log(`Cleaning up user: ${socketId}`);
    const partnerId = userPartners.get(socketId);

    if (partnerId) {
        console.log(`Notifying partner ${partnerId} of disconnect.`);
        io.to(partnerId).emit('partner-disconnected');
        userPartners.delete(partnerId); // Remove partner's link back
    } else {
        // If no partner, they might be in the waiting list
        try {
            const removedCount = await redis.lRem(WAITING_LIST, 0, socketId);
            if (removedCount > 0) {
                console.log(`Removed ${socketId} from waiting list.`);
            }
        } catch (err) {
            console.error(`Error removing ${socketId} from Redis waiting list:`, err);
        }
    }

    userPartners.delete(socketId); // Remove the user themselves
    console.log(`User ${socketId} fully cleaned up. Current partners: ${userPartners.size}`);
};

// --- Socket.IO Logic ---
io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.emit('your-id', socket.id); // Inform client of their ID

    let waitingUserId = null;
    try {
        // Try matchmaking
        waitingUserId = await redis.lPop(WAITING_LIST);
    } catch (err) {
        console.error(`Error popping from Redis waiting list:`, err);
        // Decide how to handle Redis errors, maybe put user in waiting state
        socket.emit('server-error', 'Matchmaking unavailable, please try again later.');
        // Don't proceed with matching logic if Redis failed
        return;
    }


    if (waitingUserId && waitingUserId !== socket.id) {
        // --- Match Found ---
        console.log(`Match found: ${socket.id} <-> ${waitingUserId}`);
        userPartners.set(socket.id, waitingUserId);
        userPartners.set(waitingUserId, socket.id);

        // Notify both users
        io.to(socket.id).emit('matched', { partnerId: waitingUserId });
        io.to(waitingUserId).emit('matched', { partnerId: socket.id });
        console.log(`Match notifications sent. Current partners: ${userPartners.size}`);

    } else {
        // --- No Match - Add to Waiting List ---
        if (waitingUserId === socket.id) {
             console.warn(`Popped own ID (${socket.id}) from waiting list. Pushing back.`);
             // This can happen in race conditions or if cleanup failed previously. Push it back.
             try {
                 await redis.rPush(WAITING_LIST, socket.id);
             } catch (pushErr) {
                 console.error(`Error pushing self back to Redis list:`, pushErr);
                 socket.emit('server-error', 'Matchmaking issue, please try again.');
                 return;
             }
        }
        console.log(`No match for ${socket.id}. Adding to waiting list.`);
        try {
             await redis.rPush(WAITING_LIST, socket.id);
             socket.emit('waiting');
        } catch(err) {
             console.error(`Error pushing ${socket.id} to Redis waiting list:`, err);
             socket.emit('server-error', 'Could not join waiting list, please try again.');
        }
    }

    // --- Event Handlers ---

    // Handle incoming message
    socket.on('message', ({ text }) => {
        // Basic validation
        if (typeof text !== 'string' || text.trim().length === 0 || text.length > 1000) {
             console.warn(`Invalid message received from ${socket.id}`);
             // Optionally notify sender: socket.emit('message-error', 'Invalid message format.');
             return;
         }
        notifyPartner(socket.id, 'message', { text: text.trim() });
    });

    // Handle typing events
    socket.on('typing', (isTyping) => {
         // Basic validation
         if (typeof isTyping !== 'boolean') {
             console.warn(`Invalid typing status received from ${socket.id}`);
             return;
         }
        notifyPartner(socket.id, 'typing', { isTyping });
    });

    // Handle WebRTC signaling
    socket.on('signal', (payload) => {
        // Add validation if needed (e.g., check payload structure)
        // console.log(`Relaying signal from ${socket.id}`); // Verbose
        notifyPartner(socket.id, 'signal', payload);
    });

    // Handle explicit disconnect request (e.g., user clicks "End Chat")
    socket.on('leave', () => {
        console.log(`User ${socket.id} requested leave.`);
        // Same logic as disconnect, ensures partner is notified immediately
        cleanupUser(socket.id);
         // Optionally force disconnect if client doesn't automatically
        // socket.disconnect(true);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}, Reason: ${reason}`);
        cleanupUser(socket.id); // Use the cleanup function
    });
});

const PORT = process.env.PORT || 3001; // Default to 3000 if not set
httpServer.listen(PORT, () => {
    console.log(`Socket server listening`);
});