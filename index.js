/*
 * Copyright (c) 2024.
 * @author: Frederic Wild
*/


// Load libraries. if fails, exit the program

let mysql
let express
let logger

try {
    mysql = require("mysql")
    express = require("express")
    logger = require("./logger.js")
} catch (error){
    console.error("Could not load libraries. Error: " + error)
    console.log("exiting...")
    process.exit(-1)
}

// Settings and infos as const
const WEBSOCKET_PORT = 1234
const MYSQL_PORT = 3306
const DATABASE_STATES = {
    connected: "authenticated",
    disconnected: "disconnected"
}


const app = express()

const database = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "sas",
})

database.connect((error) => {
    if (error){
        logger.log_error(error.stack)
    }
    logger.log_info("Connected with thread id " + database.threadId)
})

let bla = {
    name: "bla",
    classID: 1
}
database.query("CREATE TABLE IF NOT EXISTS students (ID int PRIMARY KEY, firstname TINYTEXT, middlename TINYTEXT, lastname TINYTEXT, classID int)", (error, results, fields) => {})
database.query("CREATE TABLE IF NOT EXISTS classes (classID INT PRIMARY KEY, shortname VARCHAR(20), longname VARCHAR(100), teacherID INT)");


app.get("/students/:id", (req, res) => {
  const id = parseInt(req.params.id);
  database.query(`SELECT * FROM students WHERE id = ?`, [id], (error, results, fields) => {
    if (error) {
      res.status(503).send({
        message: error.message
      });
      return;
    }

    if (results.length === 0) {
      res.status(404).send({
        message: "Student not found"
      });
      return;
    }

    res.send(results[0]);
  });
});
app.listen(8080)

