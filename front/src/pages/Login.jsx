import React, { useState, useEffect, useContext } from 'react'
import { SocketContext,useSocket } from '../context/SocketContext.jsx'
import Actions from '../../Action.js'
import { useNavigate } from 'react-router-dom'

function Login() {
    const socket = useSocket()
    const [email, setEmail] = useState("")
    const [roomId, setRoomId] = useState("")
    const { setUser } = useContext(SocketContext)
    const naviagate = useNavigate()
    useEffect(() => {
        if (!socket) return
        socket.on(Actions.JOIN, (data) => {
            setUser(data)
            console.log(data)
            naviagate("/")
        })

        return () => {
            socket.off(Actions.JOIN)
        }
    }, [socket])

    const handleSubmit = (e) => {
        e.preventDefault()
        socket.emit(Actions.JOIN, { email, roomId })
    }
//  make the ui better and minimilistic
   return (
  <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm bg-white p-6 md:p-8 rounded-xl shadow-lg flex flex-col space-y-5"
    >
      <h2 className="text-2xl font-bold text-gray-800 text-center">Join a Room</h2>

      <input
        type="email"
        placeholder="Enter your email"
        onChange={(e) => setEmail(e.target.value)}
        required
        className="px-4 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
      />

      <input
        type="text"
        placeholder="Enter Room ID"
        onChange={(e) => setRoomId(e.target.value)}
        required
        className="px-4 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
      />

      <button
        type="submit"
        className="w-full bg-indigo-500 text-white py-2 rounded-md font-medium hover:bg-indigo-600 transition"
      >
        Join
      </button>
    </form>
  </div>
);


}

export default Login

