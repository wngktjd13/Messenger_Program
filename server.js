const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 5005;

let onlineUsers = {};
let privateChats = {};
let groupChats = {};

if (fs.existsSync('onlineUsers.json')) {
    const data = fs.readFileSync('onlineUsers.json');
    onlineUsers = JSON.parse(data);
}
if (fs.existsSync('privateChats.json')) {
    const data = fs.readFileSync('privateChats.json');
    privateChats = JSON.parse(data);
}
if (fs.existsSync('groupChats.json')) {
    const data = fs.readFileSync('groupChats.json');
    groupChats = JSON.parse(data);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

app.post('/login', (req, res) => {
    const { id, ip, port, socketId } = req.body;
    onlineUsers[id] = { ip, port, online: true, socketId };
    fs.writeFileSync('onlineUsers.json', JSON.stringify(onlineUsers));
    res.send(onlineUsers);
});

app.post('/logout', (req, res) => {
    const { id } = req.body;
    if (onlineUsers[id]) {
        onlineUsers[id].online = false;
        fs.writeFileSync('onlineUsers.json', JSON.stringify(onlineUsers));
        res.send({ success: true });
    } else {
        res.send({ success: false });
    }
});

app.get('/online-users', (req, res) => {
    res.send(onlineUsers);
});

app.get('/private-chats', (req, res) => {
    res.send(privateChats);
});

app.get('/group-chats', (req, res) => {
    res.send(groupChats);
});

app.post('/create-group-chat', (req, res) => {
    const { roomName, creatorId } = req.body;
    if (groupChats[roomName]) {
        return res.status(400).send({ success: false, message: '채팅방 이름이 이미 존재합니다.' });
    }
    groupChats[roomName] = {
        members: [creatorId],
        messages: []
    };
    fs.writeFileSync('groupChats.json', JSON.stringify(groupChats));
    res.send({ success: true, roomName, members: groupChats[roomName].members });
});

app.post('/invite-to-group', (req, res) => {
    const { roomName, inviterId, inviteeId } = req.body;
    if (!groupChats[roomName]) {
        return res.status(400).send({ success: false, message: '채팅방이 존재하지 않습니다.' });
    }
    if (!groupChats[roomName].members.includes(inviterId)) {
        return res.status(400).send({ success: false, message: '초대할 권한이 없습니다.' });
    }
    if (!groupChats[roomName].members.includes(inviteeId)) {
        groupChats[roomName].members.push(inviteeId);
        fs.writeFileSync('groupChats.json', JSON.stringify(groupChats));
        const userSocketId = onlineUsers[inviteeId]?.socketId;
        if (userSocketId) {
            io.to(userSocketId).emit('invitedToGroup', { roomName });
        }
    }
    res.send({ success: true, roomName, members: groupChats[roomName].members });
});

app.post('/delete-group-chat', (req, res) => {
    const { roomName, requesterId } = req.body;
    if (!groupChats[roomName]) {
        return res.status(400).send({ success: false, message: '채팅방이 존재하지 않습니다.' });
    }
    if (!groupChats[roomName].members.includes(requesterId)) {
        return res.status(400).send({ success: false, message: '채팅방 삭제 권한이 없습니다.' });
    }
    delete groupChats[roomName];
    fs.writeFileSync('groupChats.json', JSON.stringify(groupChats));
    io.to(roomName).emit('groupDeleted', { roomName });
    res.send({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join', (id) => {
        if (onlineUsers[id]) {
            onlineUsers[id].online = true;
            onlineUsers[id].socketId = socket.id;
            fs.writeFileSync('onlineUsers.json', JSON.stringify(onlineUsers));
            socket.join(id);
            console.log(`${id} joined`);
            io.emit('updateUsers', onlineUsers);
        }
    });

    socket.on('leave', (id) => {
        if (onlineUsers[id]) {
            onlineUsers[id].online = false;
            fs.writeFileSync('onlineUsers.json', JSON.stringify(onlineUsers));
            io.emit('updateUsers', onlineUsers);
        }
    });

    socket.on('message', ({ from, to, message }) => {
        if (!privateChats[from]) {
            privateChats[from] = [];
        }
        if (!privateChats[to]) {
            privateChats[to] = [];
        }
        privateChats[from].push({ from, message });
        privateChats[to].push({ from, message });
        fs.writeFileSync('privateChats.json', JSON.stringify(privateChats));
        const userSocketId = onlineUsers[to]?.socketId;
        if (userSocketId) {
            io.to(userSocketId).emit('message', { from, message });
        }
    });

    socket.on('groupMessage', ({ roomName, from, message }) => {
        const timestamp = new Date().toLocaleString();
        if (groupChats[roomName] && groupChats[roomName].members.includes(from)) {
            groupChats[roomName].messages.push({ from, message, timestamp });
            fs.writeFileSync('groupChats.json', JSON.stringify(groupChats));
            io.to(roomName).emit('newGroupMessage', { from, message, timestamp });
        } else {
            socket.emit('error', { message: '이 채팅방에 참여할 수 없습니다.' });
        }
    });

    socket.on('joinRoom', (roomName, userId) => {
        if (groupChats[roomName] && groupChats[roomName].members.includes(userId)) {
            socket.join(roomName);
            console.log(`${userId} joined ${roomName}`);
        }
    });

    socket.on('leaveRoom', (roomName, userId) => {
        if (groupChats[roomName] && groupChats[roomName].members.includes(userId)) {
            socket.leave(roomName);
            console.log(`${userId} left ${roomName}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        let disconnectedUser;
        for (let [key, value] of Object.entries(onlineUsers)) {
            if (value.socketId === socket.id) {
                onlineUsers[key].online = false;
                disconnectedUser = key;
                break;
            }
        }
        if (disconnectedUser) {
            fs.writeFileSync('onlineUsers.json', JSON.stringify(onlineUsers));
            io.emit('updateUsers', onlineUsers);
        }
    });
});

server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));