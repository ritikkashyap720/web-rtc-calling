import { useMemo } from "react";
import { io } from "socket.io-client";
import { createContext, useContext, useState } from "react";

export const SocketContext = createContext(null)

export const useSocket = () => {
    if(!SocketContext) {
        throw new Error("useSocket must be used within a SocketContextProvider")
    }
    const { socket } = useContext(SocketContext)
    return socket
}

export const SocketContextProvider = ({ children }) => {
    const [user, setUser] = useState({})
    const backendUrl = import.meta.env.VITE_BACKEND_URL
    const socket = useMemo(() => io(backendUrl), [])

    return (
        <SocketContext.Provider value={{ socket, user, setUser}}>
            {children}
        </SocketContext.Provider>
    )
}
