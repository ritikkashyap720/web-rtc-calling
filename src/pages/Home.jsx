import React, { useContext, useEffect, useRef, useState } from 'react'
import { SocketContext, useSocket } from '../context/SocketContext.jsx'
import { Navigate } from 'react-router-dom'
import Actions from '../../Action.js'

function Home() {
    const { user } = useContext(SocketContext)
    const [myStream, setMyStream] = useState(null)
    const socket = useSocket()
    const localAudioRef = useRef();
    const [localStream, setLocalStream] = useState(null);

    useEffect(() => {
        if (!socket) return;

        socket.emit(Actions.MESSAGE, { email: user.email, roomId: user.roomId, message: `hello ${user.email}` })

        socket.on(Actions.MESSAGE, (data) => {
            console.log(data)
        })

        const getMedia = async () => {
            try {
                // Requesting only audio stream
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                setLocalStream(stream);
                if (localAudioRef.current) {
                    localAudioRef.current.srcObject = stream;
                }
                console.log(stream)
            } catch (err) {
                console.error("Error accessing media devices.", err);
            }
        };

        getMedia();

        return () => {
            socket.emit(Actions.LEAVE, { email: user.email, roomId: user.roomId })
        }

    }, [socket]);


    if (!Object.keys(user).length) {
        return <Navigate to="/login" />
    }

    return (
        <div>
            <p>{user.email}</p>
            <p>{user.socketId}</p>
            <audio ref={localAudioRef} autoPlay playsInline muted></audio>
        </div>
    )
}

export default Home
