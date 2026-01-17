# Redis Distributed Chat

A real-time chat application using **Node.js**, **Socket.io**, and **Redis** for distributed state management and message persistence.

## Technical Features

* **Distributed Architecture**: Uses **Redis Pub/Sub** to synchronize messages, typing events, and user updates across multiple server instances.
* **Client-Side Encryption**: Implements XOR-based encryption/decryption in the browser using a shared secret key.
* **Message Persistence**: Stores a rolling window of the last 50 messages in a **Redis List** (`CHAT_HISTORY`).
* **Presence Tracking**: Manages a global list of online users using a **Redis Set** (`ONLINE_USERS`).
* **Real-time Events**:
* `set_username`: Registers users and broadcasts the updated global user list.
* `send_message`: Distributes encrypted payloads and updates Redis history.
* `typing`: Broadcasts typing status to other clients.
* `delete_message`: Removes specific messages from the Redis List and triggers UI updates globally.


* **Local UI Management**: "Clear History" resets the local message container without modifying the database.

## Environment Variables

The server requires the following environment variables:

* `PORT`: The port on which the Express server listens (default: 3001).
* `REDIS_URL`: The connection string for the Redis instance (default: `redis://localhost:6379`).

## Usage

1. **Install Dependencies**: `npm install`
2. **Start Server**: `node server.js`
3. **Client Access**: The frontend is served as a static asset from the `public` directory.
