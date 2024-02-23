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
    "database": "sas"
}

const app = express()
app.use(express.json())

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
function initMySQL() {
    query("CREATE DATABASE IF NOT EXISTS sas; " +
        "USE sas; " +
        "CREATE TABLE IF NOT EXISTS students (id int PRIMARY KEY, firstname TINYTEXT, middlename TINYTEXT, lastname TINYTEXT, classid int); " +
        "CREATE TABLE IF NOT EXISTS classes (classid INT PRIMARY KEY, shortname VARCHAR(20), longname VARCHAR(100), teacherid INT); " +
        "CREATE TABLE IF NOT EXISTS credentials (id VARCHAR(20), password TEXT); ").catch(error => console.error(error))
}
initMySQL()


app.get("/students/:id", (request, response) => {
  const id = parseInt(request.params.id);


  query(`SELECT * FROM students WHERE id =?`, [id]).then((results, fields) => {
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

  query(`SELECT * FROM classes WHERE classid = ?`, [id]).then((results, fields) => {
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

    let queryString = "SELECT * FROM classes " + limit + " " + offset;
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
        if (student.firstname === undefined || student.id === undefined || student.lastname === undefined || student.classid === undefined){
            res.status(400).send({error: "firstname, lastname, id and classid are required"})
            return
        }
        query("INSERT INTO students (id, firstname, middlename, lastname, classid) VALUES (?,?,?,?,?)", [student.id, student.firstname, student.middlename, student.lastname, student.classid]).catch(error => {
            res.status(error.code).send({error: error.error})
            return
        })
    }
    res.status(200).send({message: "Students added successfully"})

})

app.put("/students/:id", (req, res) => {
    if (!req.is("application/json")){
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    let body = req.body;
    if (body === null) {
        res.status(400).send({error: "Body cannot be empty"})
        return
    }

    let student = body;
    if (!(student instanceof Object)){
        res.status(400).send({error: "Body must be a map of object"})
        return
    }
    if (student.firstname === undefined || student.lastname === undefined || student.classid === undefined){
        res.status(400).send({error: "Firstname, Lastname and ClassID are required"})
        return
    }
    query("INSERT INTO students (id, firstname, middlename, lastname, classid) VALUES (?,?,?,?,?)", [req.params.id, student.firstname, student.middlename, student.lastname, student.classid]).then(()=>{
        res.status(200).send({message: "Student added successfully"})
    }).catch(error => {
        res.status(error.code).send({error: error.error})
    })

})

app.get('/students/login', (req, res) => {
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }
    if (req.body.id === undefined || req.body.password === undefined) {
        res.status(400).send({error: "id and password are required"})
        return
    }

    query("SELECT * FROM credentials WHERE id =? AND password =?", [req.body.id, req.body.password]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        res.status(200).send({message: "Login successful"});
    }).catch((err) => {
        res.status(err.code).send({error: err.error})
    })

})


app.put('/student/login', (req, res) => {
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }
    if (req.body.id === undefined || req.body.password === undefined) {
        res.status(400).send({error: "id and password are required"})
        return
    }

    query("SELECT * FROM students WHERE ID =?", [req.body.id]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Student not found"})
            return
        }

        query('SELECT * from credentials WHERE id =?', [req.body.id]).then((results_, fields_) => {

            if (results_.length === 0) {
                query('INSERT INTO credentials (id, password) VALUES (?,?)', [req.body.id, req.body.password]).then(()=>{
                    res.status(200).send({message: "Credentials successfully added"});
                }).catch(error => {
                    res.status(error.code).send({error: error.error})
                })
            } else {
                query("UPDATE credentials SET password =? WHERE id =?", [req.body.password, req.body.id]).then(() => {
                    res.status(200).send({message: "Credentials updated successfully"})
                }).catch(error => {
                    res.status(error.code).send({error: error.error})
                })
            }
        }).catch(error => {
            res.status(error.code).send({error: error.error})
        })
    }).catch(error => {
        res.status(error.code).send({error: error.error})
    })
})

app.get('/students/:id/class', (req, res) => {
    const studentID = parseInt(req.params.id);
    query(`SELECT * FROM classes WHERE classid = (SELECT classID FROM students WHERE id = ?)`, [studentID]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        res.send(results[0]);
    }).catch(error => {
        res.status(error.code).send({error: error.error})
    })
})

app.listen(8080)

