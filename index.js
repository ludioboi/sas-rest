/*
 * Copyright (c) 2024.
 * @author: Frederic Wild
*/


// Load libraries. if fails, exit the program

let mysql
let express
let logger
let database

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
const config = {
    host: "localhost",
    port: MYSQL_PORT,
    user: "root",
    database: "sas"
}

const app = express()
app.use(express.json())

function initMySQL() {
    database.query("CREATE DATABASE IF NOT EXISTS sas")
    database.query("USE sas")
    database.query("CREATE TABLE IF NOT EXISTS students (ID int PRIMARY KEY, firstname TINYTEXT, middlename TINYTEXT, lastname TINYTEXT, classID int)", (error, results, fields) => {})
    database.query("CREATE TABLE IF NOT EXISTS classes (classID INT PRIMARY KEY, shortname VARCHAR(20), longname VARCHAR(100), teacherID INT)");
}

function query(query, values=[]){
    return new Promise((resolve, reject) => {
        database.query(query, values, (error, results, fields) => {
            if (error) {
                reject({code: 503, error: error});
                return
            }
            resolve(results, fields)
        })
    })
}

database = mysql.createPool(config)
database.on('connection', (connection) => {
    logger.log_info("Connected with thread id " + connection.threadId)
    connection.on('error', (error) => {
        logger.log_error("Error on thread id " + connection.threadId + ": " + error)
    })
})


app.get("/students/:id", (request, response) => {
  const id = parseInt(request.params.id);


  query(`SELECT * FROM students WHERE ID =?`, [id]).then((results, fields) => {
      if (results.length === 0) {
          response.status(404).send({error: "Entry not found"})
          return
      }
      response.send(results[0]);
  }).catch((error) => {
      response.status(error.code).send({error: error.error});
  })
});

app.get("/classes/:id", (req, res) => {
  const id = parseInt(req.params.id);

  query(`SELECT * FROM classes WHERE classID = ?`, [id]).then((results, fields) => {
      if (results.length === 0) {
          res.status(404).send({error: "Entry not found"})
          return
      }
      res.send(results[0]);
  }).catch(error => {
      res.status(error.code).send({error: error.error});
  })
});

app.get("/classes", (req, res) => {
    let limit = "", offset = "";
    if (req.query.limit) {
        limit = "LIMIT " + parseInt(req.query.limit)
    }
    if (req.query.offset) {
        offset = "OFFSET " + parseInt(req.query.offset)
    }

    let queryString = "SELECT * FROM students " + limit + " " + offset;
    query(queryString.replaceAll("  ", " ")).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        res.send(results);
    }).catch((error) => {
        res.status(error.code).send({error: error.error});
    })
})

app.get("/students", (req, res) => {
    let limit = "", offset = "";
    if (req.query.limit) {
        limit = "LIMIT " + parseInt(req.query.limit)
    }
    if (req.query.offset) {
        offset = "OFFSET " + parseInt(req.query.offset)
    }
    let queryString = "SELECT * FROM students " + limit + " " + offset;
    query(queryString.replaceAll("  ", " ")).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        res.send(results);
    }).catch((error) => {
        res.status(error.code).send({error: error.error});
    })
});

app.put("/students", (req, res) => {
    if (!req.is("application/json")){
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    let body = req.body;
    if (body === null){
        res.status(400).send({error: "Body cannot be empty"})
        return
    }
    logger.log_info(body)
    if (!(Array.isArray(body))){
        res.status(400).send({error: "Body must be an array"})
        return
    }

    let error = false;

    for (let student of body) {
        if (!(student instanceof Object)){
            res.status(400).send({error: "Body must be an array of objects"})
            return
        }
        if (student.firstname === undefined || student.ID === undefined || student.lastname === undefined || student.class === undefined){
            res.status(400).send({error: "Firstname, Lastname, ID and ClassID are required"})
            return
        }
        query("INSERT INTO students (id, firstname, middlename, lastname, class) VALUES (?,?,?,?,?)", [student.id, student.firstname, student.middlename, student.lastname, student.class]).catch(error => {
            res.status(error.code).send({error: error.error})
            return
        })
    }
    res.status(200).send({message: "Students added successfully"})

})


app.listen(8080)

