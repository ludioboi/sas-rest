const { io } = require("socket.io-client");
const socket = io("ws://192.168.178.72:3030");
socket.on("connect", function() {
    console.log("connected")
    socket.emit("token", "X8S1VhgaEc%HW7gHzptbaiO@j!oOGYSfceXY")

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