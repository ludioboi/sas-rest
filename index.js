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
} catch (error) {
    console.error("Could not load libraries. " + error)
    console.log("exiting...")
    process.exit(-1)
}
logger.info("Loaded libraries")

// Settings and infos as const
const WEBSOCKET_PORT = 1234
const MYSQL_PORT = 3306

const config = {
    host: "localhost",
    port: MYSQL_PORT,
    user: "root",
    database: "sas"
}

const app = express()
app.use(express.json())

//MySQL query, if an error occurs, it gets rejected by the promise

function query(query, values = []) {
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

//On query, a new connection to the database is created
database.on('connection', (connection) => {
    connection.on('error', (error) => {
        logger.error("Error on thread id " + connection.threadId + ": " + error)
    })
})

//Creates all necessary tables
function initMySQL() {
    query('CREATE TABLE IF NOT EXISTS students_classes (personid INT NOT NULL, classid int not null)').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS classes (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'short VARCHAR(15) NOT NULL, ' +
        'description VARCHAR(255), ' +
        'teacherid INT NOT NULL,' +
        'sec_teacherid INT);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS person (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'firstname VARCHAR(255) NOT NULL, ' +
        'secondname VARCHAR(255), ' +
        'lastname VARCHAR(255) NOT NULL, ' +
        'short VARCHAR(5), ' +
        'role int not null);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS rooms (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'short VARCHAR(15) NOT NULL, ' +
        'description VARCHAR(255));').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS credentials (personid INT NOT NULL PRIMARY KEY, ' +
        'password VARCHAR(25) NOT NULL);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS authorization (personid int not null primary key, token VARCHAR(36) not null, level int not null, expires timestamp null);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS short_keys (short varchar(4) not null, personid int, classid int);').catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS present_students (personid int not null, classid int not null, date DATE not null, time int not null)")
    query("CREATE TABLE IF NOT EXISTS timetable (classid int not null, roomid int not null, time int not null, teacherid int not null, subject varchar(16) not null)")

}

initMySQL()

function getPersonIDByShortKey(short, classid) {
    return new Promise((resolve, reject) => {
        query('SELECT * FROM short_keys WHERE short = ? AND classid = ?', [short, classid]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            resolve(results[0].personid)
        }).catch((error) => {
            reject({code: error.code, error: error.error})
        })
    })
}

function getTokenByLogin(id, password) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM credentials
               WHERE personid = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            if (results[0].password === password) {
                query('SELECT token FROM authorization WHERE personid =?', [id]).then((results, fields) => {
                    if (results.length === 0) {
                        reject({code: 404, error: "Token not found"})
                        return
                    }
                    resolve(results[0].token)
                })
            } else {
                reject({code: 401, error: "Wrong password"})
            }
        }).catch((error) => {
            reject({code: error.code, error: error.error})
        })
    })
}

function getPerson(id) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM person
               WHERE id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            resolve(results[0])
        }).catch((error) => {
            reject({code: error.code, error: error.error})
        })
    })
}

function getClassByPersonID(id) {
    return new Promise((resolve, reject)=>{
        query("SELECT classid FROM students_classes WHERE personid = ?", [id]).then((results ,fields) => {
            if (results.length === 0){
                reject({code: 404, "error": `Class not found`})
                return
            }
            getClass(results[0].classid).then(class_ => {
                resolve(class_)
            }).catch(error => {
                reject(error)
            })
        }).catch(error => {
            reject(error)
        })
    })
}

function getPersons(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM person" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (limit !== undefined ? " LIMIT " + limit : "") + (offset !== undefined ? " OFFSET " + offset : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject({code: error.code, error: error.error});
        })
    })
}

function getStudents(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM person where role = 1" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (limit !== undefined ? " LIMIT " + limit : "") + (offset !== undefined ? " OFFSET " + offset : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject({code: error.code, error: error.error});
        })
    })
}

function getRoom(id) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM rooms
               WHERE id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            resolve(results[0])
        }).catch((error) => {
            reject({code: error.code, error: error.error})
        })
    })
}

function getRooms(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM rooms" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (offset !== undefined ? " OFFSET " + offset : "") + (limit !== undefined ? " LIMIT " + limit : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject({code: error.code, error: error.error});
        })
    })
}

function getClass(id) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM classes
               WHERE id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }

            let classObject = results[0]
            getPerson(classObject.teacherid).then((teacher) => {
                classObject.teacher = teacher
                console.log(classObject)
                if (classObject.sec_teacherid !== null) {
                    getPerson(classObject.sec_teacherid).then((sec_teacher) => {
                        classObject.sec_teacher = sec_teacher
                        resolve(classObject)
                    }).catch((error) => {
                        reject({code: error.code, error: error.error})
                    })
                } else {
                    resolve(classObject)
                }
            }).catch((error) => {
                reject({code: error.code, error: error.error})
            })
        }).catch((error) => {
            reject({code: error.code, error: error.error})
        })
    })
}

function getClasses(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM classes" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (limit !== undefined ? " LIMIT " + limit : "") + (offset !== undefined ? " OFFSET " + offset : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject({code: error.code, error: error.error});
        })
    })
}

function getAuthorizationByToken(token) {
    return new Promise((resolve, reject) => {
        query("SELECT * FROM authorization where token = ?", [token]).then((results) => {
            if (results.length === 0) {
                reject({code: 404, error: "Token does not exists"})
                return
            }
            let entry = results[0]
            getPerson(entry["personid"]).then((person) => {
                entry["person"] = person
                resolve(entry)
            }).catch(() => {
                resolve(entry)
            })
        }).catch((error) => {
            reject(error)
        })
    })
}

function checkAuthorizationLevel(request, level) {
    return new Promise((resolve, reject) => {
        let auth = request.headers["authorization"]
        if (auth === undefined) {
            reject({code: 401, error: "No Authorization Header found"})
        } else {
            getAuthorizationByToken(auth).then((auth) => {
                if (auth["expires"] !== undefined && auth["expires"] !== null) {
                    let jsDate = new Date(Date.parse(String(auth["expires"])))
                    if (jsDate.getMilliseconds() < Date.now()) {
                        reject({code: 403, error: "Token expired"})
                        return
                    }
                }

                if (auth["level"] >= level) {
                    resolve(auth)
                } else {
                    reject({code: 403, error: "Not allowed"})
                }
            })
        }
    })
}


let endpoints = []
consoleCallColorFormat = {
    "get": logger.Colors.FOREGROUND_GREEN + logger.Colors.BRIGHT,
    "delete": logger.Colors.FOREGROUND_RED + logger.Colors.BRIGHT,
    "post": logger.Colors.FOREGROUND_YELLOW + logger.Colors.BRIGHT,
    "put": logger.Colors.FOREGROUND_MAGENTA + logger.Colors.BRIGHT,
}
function api(call, endpoint, func, permlevel = undefined) {
    endpoints.push({method: call, endpoint: endpoint, permission: permlevel})
    app[call](endpoint, (request, response) => {

        if (permlevel !== undefined) {
            checkAuthorizationLevel(request, permlevel).then((auth) => {
                logger.info(`API CALL: ${consoleCallColorFormat[call] + call.toUpperCase() + logger.Colors.RESET} ${"'" + logger.Colors.FOREGROUND_BLUE + logger.Colors.UNDERSCORE + endpoint + logger.Colors.RESET + "'"} authorized`)
                func(request, response, auth)
            }).catch((error) => {
                logger.info(`API CALL: ${consoleCallColorFormat[call] + call.toUpperCase() + logger.Colors.RESET} ${"'" + logger.Colors.FOREGROUND_BLUE + logger.Colors.UNDERSCORE + endpoint + logger.Colors.RESET + "'"} declined`)
                response.status(error.code).send({error: error.error})
            })
        } else {
            logger.info(`API CALL: ${consoleCallColorFormat[call] + call.toUpperCase() + logger.Colors.RESET} ${"'" + logger.Colors.FOREGROUND_BLUE + logger.Colors.UNDERSCORE + endpoint + logger.Colors.RESET + "'"} accepted`)
            func(request, response)
        }
    })
}

api("post", "/me/present", (req, res, auth) => {

}, 1)

api("get", "/me", (request, response, auth) => {
    let person = auth.person
    getClassByPersonID(person.id).then(class_ => {
        person["class"] = class_
        response.send(person)
    }).catch(error => {
        console.log(error)
        response.send(person)
    })
}, 1)

api("get", "/persons", (request, response) => {
    let limit = request.query.limit, offset = request.query.offset, orderby = request.query.orderby;
    if (orderby !== undefined) {
        orderby = JSON.parse(orderby)
        if (orderby["keyword"] === undefined && orderby["direction"] === undefined) {
            response.status(400).send({error: "orderby keyword and direction (ASC, DESC) must be specified"})
            return
        }
    }
    getPersons(limit, offset, orderby).then((persons) => {
        response.send(persons);
    }).catch((error) => {
        response.status(error.code).send({error: error.error});
    })
}, 2)

api("get", "/persons/:id", (request, response) => {
    const id = parseInt(request.params.id);

    getPerson(id).then((person) => {
        response.send(person);
    }).catch((error) => {
        response.status(error.code).send({error: error.error});
    })
}, 2)

api("get", "/rooms/:id", (request, response) => {
    const id = parseInt(request.params.id);

    getRoom(id).then((person) => {
        response.send(person);
    }).catch((error) => {
        response.status(error.code).send({error: error.error});
    })
}, 1)


//ToDO: Rework, add token verification
api("get", "/classes/:id", (req, res) => {
    const id = parseInt(req.params.id);

    getClass(id).then((classObject) => {
        res.send(classObject);
    }).catch(error => {
        res.status(error.code).send({error: error.error});
    })
}, 1)

api("get", "/classes", (req, res) => {
    let limit = req.query.limit, offset = req.query.offset, orderby = req.query.orderby;
    if (orderby !== undefined) {
        orderby = JSON.parse(orderby)
        if (orderby["keyword"] === undefined && orderby["direction"] === undefined) {
            res.status(400).send({error: "orderby keyword and direction (ASC, DESC) must be specified"})
            return
        }
    }
    getClasses(limit, offset).then((classes) => {
        res.send(classes);
    }).catch((error) => {
        res.status(error.code).send({error: error.error});
    })
}, 1)


api("get", "/rooms", (req, res) => {
    let limit = req.query.limit, offset = req.query.offset, orderby = req.query.orderby;
    if (orderby !== undefined) {
        orderby = JSON.parse(orderby)
        if (orderby["keyword"] === undefined && orderby["direction"] === undefined) {
            res.status(400).send({error: "orderby keyword and direction (ASC, DESC) must be specified"})
            return
        }
    }
    getRooms(limit, offset).then((classes) => {
        res.send(classes);
    }).catch((error) => {
        res.status(error.code).send({error: error.error});
    })
}, 1)

//ToDO: Rework, add token verification

api("get", "/students", (req, res) => {
    let limit = req.query.limit, offset = req.query.offset, orderby = req.query.orderby;
    if (orderby !== undefined) {
        orderby = JSON.parse(orderby)
        if (orderby["keyword"] === undefined && orderby["direction"] === undefined) {
            res.status(400).send({error: "orderby keyword and direction (ASC, DESC) must be specified"})
            return
        }
    }
    getStudents(limit, offset, orderby).then((students) => {
        res.send(students);
    }).catch((error) => {
        res.status(error.code).send({error: error.error});
    })
}, 2)

api("put", "/login", (req, res) => {
    let body = req.body
    let id = body.id, password = body.password

    getTokenByLogin(id, password).then((token) => {
        res.status(200).send({token: token})
    }).catch((error) => {
        res.status(error.code).send({error: error.error})
    })
})


const tokenChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%"

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function updateToken(id) {
    return new Promise((resolve, reject) => {

        query("SELECT * FROM person WHERE id =?", [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Person not found"});
            }
            let token = ""
            for (let i = 0; i < 36; i++) {
                token += tokenChars[randomInt(0, tokenChars.length - 1)]
            }
            query("select * from authorization WHERE personid =?", [id]).then((results_, fields_) => {

                let queryString = 'UPDATE authorization SET token =? WHERE personid =?'

                if (results_.length === 0) {
                    queryString = 'INSERT INTO authorization (token, personid, level) VALUES (?,?, 1)'
                    logger.warning("Results are empty")
                }
                logger.warning("Query String: " + queryString)

                query(queryString, [token, id]).then(() => {
                    resolve(token);
                }).catch(error => {
                    reject(error);
                })
            })
        }).catch(error => {
            reject(error);
        })

    })


}

//ToDO: Rework, add token verification
api("post", "/login", (req, res) => {

    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }


    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }
    if (req.body.id === undefined || req.body.password === undefined) {
        res.status(400).send({error: "id and password are required"})
        return
    }

    query("SELECT * FROM person WHERE id =?", [req.body.id]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Student not found"})
            return
        }

        query('SELECT * from credentials WHERE personid =?', [req.body.id]).then((results_, fields_) => {
            let queryString = "UPDATE credentials SET password =? WHERE personid =?"
            if (results_.length === 0) {
                queryString = "INSERT INTO credentials (password, personid) VALUES (?,?)"
            }
            query(queryString, [req.body.password, req.body.id]).then(() => {
                updateToken(req.body.id).then(token => {
                    res.status(200).send({message: "Credentials updated successfully", token: token});
                }).catch(error => {
                    res.status(503).send({error: "Could not generate token"})
                })
            })
        }).catch(error => {
            res.status(error.code).send({error: error.error})
        })
    }).catch(error => {
        res.status(error.code).send({error: error.error})
    })
}, 1)


api("get", "/students/:id/class", (req, res) => {
    const studentID = parseInt(req.params.id);
    query("SELECT classid FROM students_classes WHERE personid = ?", [studentID]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        getClass(results[0].classid).then(classData => {
            res.status(200).send(classData);
        }).catch(error => {
            res.status(error.code).send({error: error.error})
        })
    }).catch(error => {
        res.status(error.code).send({error: error.error})
    })
}, 1)


api("get", "/shortkey/:classid/:short", (req, res) => {
    let classid = parseInt(req.params.classid), short = req.params.short;
    getPersonIDByShortKey(short, classid).then(personID => {
        res.status(200).send({personID: personID})
    }).catch((error) => res.status(error.code).send({error: error.error}))
})


api("get", "/", (request, response) => {
    response.send(endpoints)
})

app.listen(8080)

