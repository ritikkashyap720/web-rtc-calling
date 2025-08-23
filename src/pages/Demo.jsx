import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const App = () => {
  const [yourId, setYourId] = useState('');
  const [remoteId, setRemoteId] = useState('');
  const [callStatus, setCallStatus] = useState('Ready');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingAudio, setIsSendingAudio] = useState(false); // New state for outgoing audio
  const [isReceivingAudio, setIsReceivingAudio] = useState(false); // New state for incoming audio
  const remoteAudioRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    // Connect to the Socket.IO signaling server.
    // The previous code used process.env, which is not available in the browser.
    // For a real deployment on Render, you would replace this with your server's public URL.
    const signalingServerUrl = import.meta.env.VITE_BACKEND_URL;
    socketRef.current = io(signalingServerUrl);
    
    // Get the user's audio stream when the component mounts
    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        setIsSendingAudio(true); // Assume audio is being sent initially once stream is active
        stream.getAudioTracks()[0].onended = () => setIsSendingAudio(false);
      })
      .catch((err) => {
        console.error('Failed to get local stream', err);
        setCallStatus('Error: Could not access microphone.');
        setIsSendingAudio(false);
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
      
      // Create a new RTCPeerConnection with STUN servers
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
        ],
      });
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
          setIsReceivingAudio(true); // Audio is being received
          event.streams[0].getAudioTracks()[0].onended = () => setIsReceivingAudio(false);
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
      
      // Create a new RTCPeerConnection with STUN servers
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
        ],
      });
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
          setIsReceivingAudio(true); // Audio is being received
          event.streams[0].getAudioTracks()[0].onended = () => setIsReceivingAudio(false);
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
    // Reset audio status indicators
    setIsSendingAudio(false);
    setIsReceivingAudio(false);
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
          <span className={`inline-block px-4 py-2 rounded-full font-semibold ${
            callStatus === 'In Call' ? 'bg-green-100 text-green-700' :
            callStatus.includes('Error') || callStatus.includes('ended') ? 'bg-red-100 text-red-700' :
            isRecording ? 'bg-purple-100 text-purple-700 animate-pulse' :
            'bg-gray-100 text-gray-600'
          }`}>
            Status: {callStatus}
          </span>
        </div>
        
        {/* Audio Indicators */}
        <div className="flex justify-center space-x-6">
          <div className="flex flex-col items-center">
            <div className={`p-4 rounded-full ${isSendingAudio ? 'bg-green-500' : 'bg-gray-400'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
                <path d="M8.25 4.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75V4.5ZM12.75 4.5a.75.75 0 0 1 .75-.75H16.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1-.75-.75V4.5ZM8.25 10.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75V10.5ZM12.75 10.5a.75.75 0 0 1 .75-.75H16.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1-.75-.75V10.5ZM8.25 16.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75V16.5ZM12.75 16.5a.75.75 0 0 1 .75-.75H16.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1-.75-.75V16.5Z" />
                <path fillRule="evenodd" d="M18.75 2.25H5.25A2.25 2.25 0 0 0 3 4.5v15a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 19.5v-15a2.25 2.25 0 0 0-2.25-2.25ZM1.5 4.5a3.75 3.75 0 0 1 3.75-3.75h13.5a3.75 3.75 0 0 1 3.75 3.75v15a3.75 3.75 0 0 1-3.75 3.75H5.25A3.75 3.75 0 0 1 1.5 19.5v-15Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="mt-2 text-sm text-gray-600">You</p>
          </div>
          <div className="flex flex-col items-center">
            <div className={`p-4 rounded-full ${isReceivingAudio ? 'bg-green-500' : 'bg-gray-400'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
                <path d="M13.5 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 18.75a6.75 6.75 0 1 0 0-13.5 6.75 6.75 0 0 0 0 13.5ZM21.75 9c0-.414-.336-.75-.75-.75h-2.25a.75.75 0 0 0 0 1.5h2.25a.75.75 0 0 0 .75-.75ZM2.25 9c0-.414.336-.75.75-.75h2.25a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Z" />
                <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM12 18.75a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V19.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="mt-2 text-sm text-gray-600">Them</p>
          </div>
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
