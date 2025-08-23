// A simple Node.js server to run a WebRTC signaling server using Socket.IO.
// This server facilitates the exchange of signaling data (offers, answers, ICE candidates)
// to establish a direct peer-to-peer connection.

// Import necessary modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Create an Express application and an HTTP server
const app = express();
const server = http.createServer(app);
const port = 8000;

// Initialize Socket.IO on the HTTP server.
// The cors option allows connections from your front-end.
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Listen for new client connections
io.on('connection', (socket) => {
  
  console.log(`User connected with ID: ${socket.id}`);

  // Event listener for when a user joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    // Notify other users in the same room that a new user has joined.
    // This is a key signaling step to initiate a call.
    socket.to(roomId).emit('user-joined', socket.id);
  });

  // Event listener for a WebRTC SDP offer from a peer
  socket.on('offer', (data) => {
    console.log(`Offer from ${data.from} to ${data.to}`);
    // Relay the offer to the specific target peer
    io.to(data.to).emit('offer', data);
  });

  // Event listener for a WebRTC SDP answer from a peer
  socket.on('answer', (data) => {
    console.log(`Answer from ${data.from} to ${data.to}`);
    // Relay the answer to the specific target peer
    io.to(data.to).emit('answer', data);
  });

  // Event listener for a WebRTC ICE candidate
  socket.on('ice-candidate', (data) => {
    // Relay the ICE candidate to the specific target peer
    io.to(data.to).emit('ice-candidate', data);
  });

  // Event listener for when a user disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected with ID: ${socket.id}`);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`WebRTC signaling server is running on http://localhost:${port}`);
});

// You will need to install the following packages:
// npm install express socket.io
