import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5005');

function App() {
    const [id, setId] = useState('');
    const [onlineUsers, setOnlineUsers] = useState({});
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [privateChats, setPrivateChats] = useState({});
    const [activePrivateChat, setActivePrivateChat] = useState('');
    const [privateMessage, setPrivateMessage] = useState('');
    const [groupChats, setGroupChats] = useState({});
    const [activeGroupChat, setActiveGroupChat] = useState('');
    const [groupMessage, setGroupMessage] = useState('');
    const [roomName, setRoomName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const savedId = sessionStorage.getItem('id');
        if (savedId) {
            setId(savedId);
            setIsLoggedIn(true);
            socket.emit('join', savedId);
        }

        if (isLoggedIn) {
            fetch('http://localhost:5005/online-users')
                .then(response => response.json())
                .then(data => {
                    setOnlineUsers(data);
                })
                .catch(err => console.error('Failed to fetch online users:', err));

            fetch('http://localhost:5005/private-chats')
                .then(response => response.json())
                .then(data => {
                    setPrivateChats(data);
                })
                .catch(err => console.error('Failed to fetch private chats:', err));

            fetch('http://localhost:5005/group-chats')
                .then(response => response.json())
                .then(data => {
                    setGroupChats(data);
                })
                .catch(err => console.error('Failed to fetch group chats:', err));

            socket.on('updateUsers', (users) => {
                setOnlineUsers(users);
            });

            socket.on('message', ({ from, message }) => {
                setPrivateChats(prevChats => ({
                    ...prevChats,
                    [from]: [...(prevChats[from] || []), { from, message }]
                }));
            });

            socket.on('newGroupMessage', ({ from, message, timestamp }) => {
                setGroupChats(prevChats => ({
                    ...prevChats,
                    [activeGroupChat]: {
                        ...prevChats[activeGroupChat],
                        messages: [...(prevChats[activeGroupChat]?.messages || []), { from, message, timestamp }]
                    }
                }));
            });

            socket.on('invitedToGroup', ({ roomName }) => {
                setGroupChats(prevChats => ({
                    ...prevChats,
                    [roomName]: { ...prevChats[roomName], members: [...prevChats[roomName].members, id] }
                }));
                alert(`단체 채팅방 ${roomName}에 초대되었습니다.`);
            });

            socket.on('groupDeleted', ({ roomName }) => {
                setGroupChats(prevChats => {
                    const updatedChats = { ...prevChats };
                    delete updatedChats[roomName];
                    return updatedChats;
                });
                if (activeGroupChat === roomName) {
                    setActiveGroupChat('');
                }
                alert(`단체 채팅방 ${roomName}이 삭제되었습니다.`);
            });

            socket.on('error', ({ message }) => {
                setError(message);
                setTimeout(() => setError(''), 3000);
            });

            return () => {
                socket.off('updateUsers');
                socket.off('message');
                socket.off('newGroupMessage');
                socket.off('invitedToGroup');
                socket.off('groupDeleted');
                socket.off('error');
            };
        }
    }, [isLoggedIn, activeGroupChat]);

    const handleLogin = () => {
        fetch('http://localhost:5005/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, socketId: socket.id })
        }).then(res => res.json())
            .then(data => {
                setOnlineUsers(data);
                setIsLoggedIn(true);
                sessionStorage.setItem('id', id);
                alert('로그인 성공');
                socket.emit('join', id);
            });
    };

    const handleLogout = () => {
        fetch('http://localhost:5005/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        }).then(() => {
            setIsLoggedIn(false);
            setId('');
            sessionStorage.removeItem('id');
            alert('로그아웃 성공');
            socket.emit('leave', id);
        });
    };

    const handlePrivateMessageSend = (e) => {
        e.preventDefault();
        if (activePrivateChat && privateMessage) {
            socket.emit('message', { from: id, to: activePrivateChat, message: privateMessage });
            setPrivateChats(prevChats => ({
                ...prevChats,
                [activePrivateChat]: [...(prevChats[activePrivateChat] || []), { from: id, message: privateMessage }]
            }));
            setPrivateMessage('');
        }
    };

    const handleGroupMessageSend = (e) => {
        e.preventDefault();
        if (activeGroupChat && groupMessage) {
            if (groupChats[activeGroupChat].members.includes(id)) {
                socket.emit('groupMessage', { roomName: activeGroupChat, from: id, message: groupMessage });
                setGroupChats(prevChats => ({
                    ...prevChats,
                    [activeGroupChat]: {
                        ...prevChats[activeGroupChat],
                        messages: [...(prevChats[activeGroupChat]?.messages || []), { from: id, message: groupMessage }]
                    }
                }));
                setGroupMessage('');
            } else {
                setError('이 채팅방에 참여할 수 없습니다.');
                setTimeout(() => setError(''), 3000);
            }
        }
    };

    const createGroupChat = () => {
        fetch('http://localhost:5005/create-group-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, creatorId: id })
        }).then(res => res.json())
            .then(data => {
                if (data.success) {
                    setGroupChats(prevChats => ({
                        ...prevChats,
                        [roomName]: { members: [id], messages: [] }
                    }));
                    setRoomName('');
                    alert('단체 채팅방 생성 성공');
                } else {
                    alert(data.message);
                }
            });
    };

    const inviteToGroupChat = (inviteeId) => {
        fetch('http://localhost:5005/invite-to-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: activeGroupChat, inviterId: id, inviteeId })
        }).then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert(`${inviteeId}님을 ${activeGroupChat} 방에 초대했습니다.`);
                } else {
                    alert(data.message);
                }
            });
    };

    const deleteGroupChat = () => {
        fetch('http://localhost:5005/delete-group-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: activeGroupChat, requesterId: id })
        }).then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert(`단체 채팅방 ${activeGroupChat}이 삭제되었습니다.`);
                    setActiveGroupChat('');
                } else {
                    alert(data.message);
                }
            });
    };

    const handleEndGroupChat = () => {
        setActiveGroupChat('');
    };

    return (
        <div>
            <h1>메신저 프로그램</h1>
            {!isLoggedIn ? (
                <div>
                    <input
                        type="text"
                        placeholder="아이디 입력"
                        value={id}
                        onChange={(e) => setId(e.target.value)}
                    />
                    <button onClick={handleLogin}>로그인</button>
                </div>
            ) : (
                <div>
                    <div>
                        <strong>로그인된 사용자: {id}</strong>
                    </div>
                    <button onClick={handleLogout}>로그아웃</button>
                    <h2>온라인 사용자</h2>
                    <ul>
                        {Object.keys(onlineUsers).map(user => (
                            user !== id && (
                                <li key={user}>
                                    {user} - {onlineUsers[user].online ? '온라인' : '오프라인'}
                                    <button onClick={() => setActivePrivateChat(user)}>1대1 메시지</button>
                                    {activeGroupChat && (
                                        <button onClick={() => inviteToGroupChat(user)}>초대하기</button>
                                    )}
                                </li>
                            )
                        ))}
                    </ul>
                    <div>
                        <h2>개인 채팅</h2>
                        {activePrivateChat && (
                            <div>
                                <h3>
                                    {activePrivateChat}와의 개인채팅
                                    <button onClick={() => setActivePrivateChat('')} style={{ marginLeft: '10px' }}>종료</button>
                                </h3>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {(privateChats[activePrivateChat] || []).map((c, index) => (
                                        <div key={index}><strong>{c.from}:</strong> {c.message}</div>
                                    ))}
                                    <form onSubmit={handlePrivateMessageSend}>
                                        <input
                                            type="text"
                                            value={privateMessage}
                                            onChange={(e) => setPrivateMessage(e.target.value)}
                                        />
                                        <button type="submit">전송</button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                    <div>
                        <h2>단체 채팅방 만들기</h2>
                        <input
                            type="text"
                            placeholder="단체 채팅방 이름"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                        />
                        <button onClick={createGroupChat}>만들기</button>
                    </div>
                    <h2>단체 채팅방 목록</h2>
                    <ul>
                        {Object.keys(groupChats).map(room => (
                            <li key={room}>
                                {room} - 멤버 수: {groupChats[room].members.length}
                                <button onClick={() => setActiveGroupChat(room)}>채팅방 선택</button>
                            </li>
                        ))}
                    </ul>
                    <div>
                        <h2>단체 채팅</h2>
                        {activeGroupChat && (
                            <div>
                                <h3>
                                    {activeGroupChat} 채팅방
                                    <button onClick={handleEndGroupChat} style={{ marginLeft: '10px' }}>종료</button>
                                </h3>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {(groupChats[activeGroupChat]?.messages || []).map((c, index) => (
                                        <div key={index}><strong>{c.from}:</strong> {c.message}</div>
                                    ))}
                                    {error && <p style={{ color: 'red' }}>{error}</p>}
                                    <form onSubmit={handleGroupMessageSend}>
                                        <input
                                            type="text"
                                            value={groupMessage}
                                            onChange={(e) => setGroupMessage(e.target.value)}
                                        />
                                        <button type="submit">전송</button>
                                    </form>
                                    <button onClick={deleteGroupChat} style={{ marginTop: '10px', color: 'red' }}>채팅방 삭제</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;