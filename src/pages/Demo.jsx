import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const App = () => {
  const [yourId, setYourId] = useState('');
  const [remoteId, setRemoteId] = useState('');
  const [callStatus, setCallStatus] = useState('Ready');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const remoteAudioRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    // Connect to the Socket.IO signaling server
    socketRef.current = io(import.meta.env.VITE_BACKEND_URL);

    // Get the user's audio stream when the component mounts
    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
      })
      .catch((err) => {
        console.error('Failed to get local stream', err);
        setCallStatus('Error: Could not access microphone.');
      });

    // Handle connection to the server
    socketRef.current.on('connect', () => {
      setYourId(socketRef.current.id);
      setCallStatus('Connected to server');
    });

    // Listener for when a new user joins the room
    socketRef.current.on('user-joined', async (userId) => {
      console.log('User joined:', userId);
      setCallStatus('User joined, creating offer...');
      setIsCallActive(true);

      // Create a new RTCPeerConnection
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add the local audio track to the connection
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      // Handle the received remote stream
      peerConnection.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          setCallStatus('In Call');
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', {
            to: userId,
            candidate: event.candidate,
          });
        }
      };

      // Create an offer and set it as the local description
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Send the offer to the new user via the signaling server
      socketRef.current.emit('offer', {
        to: userId,
        from: socketRef.current.id,
        offer,
      });
    });

    // Listener for receiving an SDP offer
    socketRef.current.on('offer', async (data) => {
      console.log('Received offer from', data.from);
      setIsCallActive(true);

      // Create a new RTCPeerConnection
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add the local audio track to the connection
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      // Handle the received remote stream
      peerConnection.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          setCallStatus('In Call');
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', {
            to: data.from,
            candidate: event.candidate,
          });
        }
      };

      // Set the remote description from the received offer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

      // Create an answer and set it as the local description
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Send the answer back to the peer via the signaling server
      socketRef.current.emit('answer', {
        to: data.from,
        from: socketRef.current.id,
        answer,
      });
    });

    // Listener for receiving an SDP answer
    socketRef.current.on('answer', async (data) => {
      console.log('Received answer from', data.from);
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      setCallStatus('In Call');
    });

    // Listener for receiving an ICE candidate
    socketRef.current.on('ice-candidate', async (data) => {
      try {
        await peerConnectionRef.current.addIceCandidate(data.candidate);
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    });

    // Clean up the connection on component unmount
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const joinRoom = () => {
    if (!remoteId) return;
    setCallStatus('Joining room...');
    socketRef.current.emit('join-room', remoteId);
    setIsCallActive(true);
  };

  const hangUp = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsCallActive(false);
    setCallStatus('Call ended.');
    setRemoteId('');
    if (isRecording) {
      stopRecording();
    }
  };

  const startRecording = () => {
    if (!localStreamRef.current) {
      console.error('Local stream not available for recording.');
      return;
    }

    try {
      // Create a MediaRecorder instance from the local stream
      mediaRecorderRef.current = new MediaRecorder(localStreamRef.current);
      recordedChunksRef.current = [];
      setIsRecording(true);

      // Event listener for when data is available
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      // Event listener for when recording stops
      mediaRecorderRef.current.onstop = () => {
        // Create a Blob from the recorded chunks
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recorded-audio.webm';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      };

      mediaRecorderRef.current.start();
      setCallStatus('Recording...');
    } catch (e) {
      console.error('Failed to start recording:', e);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setCallStatus('Recording ended. Download starting...');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-inter">
      {/* Container for the main application content */}
      <div className="w-full max-w-xl p-8 bg-white rounded-2xl shadow-xl space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">WebRTC Audio Call</h1>

        {/* Display the user's ID */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-700">Your ID:</h2>
          <p className="text-xl font-mono text-blue-600 truncate">{yourId}</p>
        </div>

        {/* Display the current call status */}
        <div className="text-center">
          <span className={`inline-block px-4 py-2 rounded-full font-semibold ${callStatus === 'In Call' ? 'bg-green-100 text-green-700' :
              callStatus.includes('Error') || callStatus.includes('ended') ? 'bg-red-100 text-red-700' :
                isRecording ? 'bg-purple-100 text-purple-700 animate-pulse' :
                  'bg-gray-100 text-gray-600'
            }`}>
            Status: {callStatus}
          </span>
        </div>

        {/* Form for initiating a call */}
        <div className="space-y-4">
          <input
            className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
            type="text"
            placeholder="Enter remote room ID"
            value={remoteId}
            onChange={(e) => setRemoteId(e.target.value)}
            disabled={isCallActive}
          />
          <div className="flex space-x-4">
            <button
              className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={joinRoom}
              disabled={isCallActive}
            >
              Join Room
            </button>
            <button
              className="w-full bg-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-red-700 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={hangUp}
              disabled={!isCallActive}
            >
              Hang Up
            </button>
          </div>
        </div>

        {/* Recording Controls */}
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-700">Recording Controls</h3>
          </div>
          <div className="flex space-x-4">
            <button
              className="w-full bg-purple-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-purple-700 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={startRecording}
              disabled={!isCallActive || isRecording}
            >
              Start Recording
            </button>
            <button
              className="w-full bg-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-red-700 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={stopRecording}
              disabled={!isRecording}
            >
              Stop Recording
            </button>
          </div>
        </div>
      </div>

      {/* Audio element for the remote stream, hidden from the UI */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden"></audio>
    </div>
  );
};

export default App;
