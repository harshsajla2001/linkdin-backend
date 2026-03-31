const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

dotenv.config();

console.log('--- Environment Check ---');
console.log('Working Directory:', process.cwd());
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'Present' : 'MISSING');
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Present' : 'MISSING');
console.log('-------------------------');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on('join_chat', (userId) => {
    socket.join(userId);
    onlineUsers.set(userId, socket.id);
    io.emit('online_status', Array.from(onlineUsers.keys()));
    console.log(`User joined room: ${userId}`);
  });

  socket.on('typing', (data) => {
    // data: { senderId, receiverId, isTyping }
    socket.to(data.receiverId).emit('typing', { senderId: data.senderId, isTyping: data.isTyping });
  });

  socket.on('send_message', async (data) => {
    // data: { senderId, receiverId, text, file }
    try {
      // Save Message to DB
      const newMessage = await Message.create({
        sender: data.senderId,
        receiver: data.receiverId,
        text: data.text,
        file: data.file
      });

      // Update Conversation
      let conversation = await Conversation.findOne({
        participants: { $all: [data.senderId, data.receiverId] }
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [data.senderId, data.receiverId],
          lastMessage: {
            text: data.text || 'Document shared',
            sender: data.senderId
          }
        });
      } else {
        conversation.lastMessage = {
          text: data.text || 'Document shared',
          sender: data.senderId,
          createdAt: new Date()
        };
        await conversation.save();
      }

      const responseData = {
        ...data,
        id: newMessage._id,
        time: newMessage.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      io.to(data.receiverId).to(data.senderId).emit('receive_message', responseData);
    } catch (err) {
      console.error('Socket Message Error:', err);
    }
  });

  socket.on('disconnect', () => {
    let disconnectedUserId = null;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        break;
      }
    }
    if (disconnectedUserId) {
      onlineUsers.delete(disconnectedUserId);
      io.emit('online_status', Array.from(onlineUsers.keys()));
    }
    console.log('User disconnected:', socket.id);
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

const PORT = process.env.PORT || 5001;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/linkedin-clone')
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));
