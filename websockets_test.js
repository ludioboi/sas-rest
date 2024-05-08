const { io } = require("socket.io-client");
const socket = io("ws://localhost:3030");
socket.on("connect", function() {
    console.log("connected")
    socket.emit("token", "bh_1")

})
socket.on("error", (error) => {
    console.log(error)
})
socket.on("student", (student) => {
    console.log(student.toString())
})
socket.on("message", (message) => {
    console.log(message)
})
socket.connect()