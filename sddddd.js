const express = require("express")
const app = express()
const socket = require("socket.io")

const http = require("http")
const dotenv = require("dotenv")
const Actions = require("./Action")
dotenv.config()
const PORT = process.env.PORT || 4000;

const server = http.createServer(app)
// allow cors
const io = socket(server, {
  cors: {
    origin: "http://localhost:5173",
  },
})
const usersmap = new Map()

io.on("connection", (socket) => {
  socket.on(Actions.JOIN, (data) => {
    // map the email to socket id
    usersmap.set(data.email, socket.id)
    console.log(usersmap)
    console.log("No of users", usersmap.size)
    // send confirmation
    socket.join(data.roomId)
    socket.emit(Actions.JOIN, {
      email: data.email,
      socketId: socket.id,
      roomId: data.roomId
    })

    socket.on(Actions.MESSAGE, (data) => {
      console.log(data)
      io.to(data.roomId).emit(Actions.MESSAGE, {
        email: data.email,
        message: data.message
      })
    })

    socket.on(Actions.LEAVE,(data) => {
      usersmap.delete(data.email)
      console.log("No of users", usersmap.size)
      io.to(data.roomId).emit(Actions.LEAVE, {
        email: data.email,
        socketId: socket.id
      })
    })
  })
})

server.listen((PORT), () => {
  console.log(`Server started at http://localhost:${PORT}`)
})

