const express = require('express');
const redis = require('redis');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const publisher = redis.createClient({ url: REDIS_URL });
const subscriber = publisher.duplicate();

(async () => {
    await publisher.connect();
    await subscriber.connect();
    await publisher.del('ONLINE_USERS');
    console.log("Redis pub/sub connected and previous users cleared");
})();



app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('👤 User connected:', socket.id);

    // Listen for username setup
    socket.on('set_username', async (name) => {
        socket.username = name;
        console.log(`User ${socket.id} is now: ${name}`);

        await publisher.sAdd('ONLINE_USERS', name);
        const allUsers = await publisher.sMembers('ONLINE_USERS');
        await publisher.publish('USER_UPDATE', JSON.stringify(allUsers));

        try {
            const history = await publisher.lRange('CHAT_HISTORY', 0, -1);
            const parsedHistory = history.map(msg => JSON.parse(msg));
            socket.emit('chat_history', parsedHistory);
        } catch (err) {
            console.error("History fetch error:", err);
        }
    });

    socket.on('send_message', async (data) => {
        const payload = {
            // FIX: Use the username we stored on the socket
            senderId: socket.username || "Guest",
            message: data.message,
            timeStamp: new Date().toLocaleTimeString()
        };

        // Persistence
        await publisher.rPush('CHAT_HISTORY', JSON.stringify(payload));
        await publisher.lTrim('CHAT_HISTORY', -50, -1);

        // Distribution
        await publisher.publish('CHAT_CLUSTER', JSON.stringify(payload));
    });
    socket.on('typing', (isTyping) => {
        const data = {
            username: socket.username || "Guest",
            isTyping: isTyping
        };
        publisher.publish('TYPING_EVENT', JSON.stringify(data));
    });
    socket.on('disconnect', async () => {
        if (socket.username) {
            // Remove from Redis Set
            await publisher.sRem('ONLINE_USERS', socket.username);

            // Broadcast updated list
            const allUsers = await publisher.sMembers('ONLINE_USERS');
            await publisher.publish('USER_UPDATE', JSON.stringify(allUsers));
        }
    });
    
});

// Broadcast Redis messages to all local clients
subscriber.subscribe(['CHAT_CLUSTER', 'TYPING_EVENT', 'USER_UPDATE'], (message, channel) => {
    const data = JSON.parse(message);
    if (channel === 'TYPING_EVENT') {
        io.emit('display_typing', data);
    } else if (channel === 'USER_UPDATE') {
        io.emit('user_list', data); // This syncs the counter across ports
    } else {
        io.emit('receive_message', data);
    }
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`📡 Chat Server running on http://localhost:${PORT}`);
});