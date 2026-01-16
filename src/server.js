const express = require('express');
const redis = require('redis');
const http = require('http');
const { Server } = require('socket.io');
const { timeStamp } = require('console');
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
    console.log("Redis pub/sub connected");
})();

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('User connected : ', socket.id);
    
    socket.on('set_username', async (name) => {
        socket.username = name;
        console.log(`🏷️  User identified: ${name}`);

        try {
            const history = await publisher.lRange('CHAT_HISTORY', 0, -1);
            const parsedHistory = history.map(msg => JSON.parse(msg));
            socket.emit('chat_history', parsedHistory);
        } catch (err) {
            console.error("History fetch error:", err);
        }
    });

    socket.on('set_username',(name)=>{
        socket.username = name;
        console.log(`${socket.id} set name to ${name}`);
    });

    socket.on('send_message', async (data) => {
        const payload = {
            senderId: socket.username || 'GUEST',
            message: data.message,
            timeStamp: new Date().toLocaleDateString()
        };

        await publisher.rPush('CHAT_HISTORY',JSON.stringify(payload));
        await publisher.lTrim('CHAT_HISTORY', -50, -1);
        await publisher.publish('CHAT_CLUSTER', JSON.stringify(payload));
    });
    socket.on('disconnect', () => console.log('User disconnected'));
});

subscriber.subscribe('CHAT_CLUSTER', (message) => {
    const data = JSON.parse(message);
    io.emit('receive_message', data);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Chat Server running on http://localhost:${PORT}`);
});