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
    // Clear ghosts on restart
    await publisher.del('ONLINE_USERS');
    console.log("🚀 Redis Pub/Sub Active & Flushed");
})();

app.use(express.static('public'));

io.on('connection', async (socket) => {
    
    socket.on('set_username', async (name) => {
        socket.username = name;
        await publisher.sAdd('ONLINE_USERS', name);
        const allUsers = await publisher.sMembers('ONLINE_USERS');
        await publisher.publish('USER_UPDATE', JSON.stringify(allUsers));

        try {
            const history = await publisher.lRange('CHAT_HISTORY', 0, -1);
            socket.emit('chat_history', history.map(msg => JSON.parse(msg)));
        } catch (err) { console.error(err); }
    });

    socket.on('send_message', async (data) => {
        const payload = {
            senderId: socket.username || "Guest",
            message: data.message,
            timeStamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        await publisher.rPush('CHAT_HISTORY', JSON.stringify(payload));
        await publisher.lTrim('CHAT_HISTORY', -50, -1);
        await publisher.publish('CHAT_CLUSTER', JSON.stringify(payload));
    });

    socket.on('typing', (isTyping) => {
        publisher.publish('TYPING_EVENT', JSON.stringify({
            username: socket.username || "Guest",
            isTyping: isTyping
        }));
    });

    socket.on('delete_message', async (msgData) => {
        await publisher.lRem('CHAT_HISTORY', 0, JSON.stringify(msgData));
        await publisher.publish('DELETE_EVENT', JSON.stringify(msgData));
    });

    // socket.on('clear_all_history', async () => {
    //     await publisher.del('CHAT_HISTORY');
    //     await publisher.publish('CLEAR_HISTORY_EVENT', JSON.stringify({}));
    // });

    socket.on('disconnect', async () => {
        if (socket.username) {
            await publisher.sRem('ONLINE_USERS', socket.username);
            const allUsers = await publisher.sMembers('ONLINE_USERS');
            await publisher.publish('USER_UPDATE', JSON.stringify(allUsers));
        }
    });
});

// Subscriber Logic for Cluster Sync
subscriber.subscribe(['CHAT_CLUSTER', 'TYPING_EVENT', 'USER_UPDATE', 'DELETE_EVENT'], (message, channel) => {
    const data = JSON.parse(message);
    switch(channel) {
        case 'DELETE_EVENT': io.emit('remove_message_from_ui', data); break;
        case 'USER_UPDATE': io.emit('user_list', data); break;
        case 'TYPING_EVENT': io.emit('display_typing', data); break;
        default: io.emit('receive_message', data);
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`📡 Server: http://localhost:${PORT}`));