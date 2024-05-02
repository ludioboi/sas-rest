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
    query('CREATE TABLE IF NOT EXISTS students_classes (user_id INT NOT NULL, class_id int not null)').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS classes (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'short VARCHAR(15) NOT NULL, ' +
        'description VARCHAR(255), ' +
        'teacher_id INT NOT NULL,' +
        'sec_teacher_id INT);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS user (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'firstname VARCHAR(255) NOT NULL, ' +
        'secondname VARCHAR(255), ' +
        'lastname VARCHAR(255) NOT NULL, ' +
        'short_name VARCHAR(5), ' +
        'role int not null);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS rooms (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'short VARCHAR(15) NOT NULL, ' +
        'description VARCHAR(255));').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS credentials (user_id INT NOT NULL PRIMARY KEY, ' +
        'password VARCHAR(25) NOT NULL);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS authorization (user_id int not null primary key, token VARCHAR(36) not null, level int not null, expires int null);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS short_keys (short varchar(4) not null, user_id int);').catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS timetable (class_id int not null, room_id int not null, time_id int not null, teacher_id int not null, subject varchar(16) not null, day VARCHAR(5) not null, double_lesson boolean)").catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS substition (class_id int not null, room_id int not null, time_id int not null, teacher_id int, subject varchar(16), day VARCHAR(5) not null, date int not null, double_lesson boolean)").catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS times (time_id int not null, start_time int not null)").catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS presence (user_id int not null, time_id int not null, date int not null, present_from int not null, present_until int not null)").catch(error => console.error(error))


}

initMySQL()

function getUserIdByShortKey(short, class_id) {
    return new Promise((resolve, reject) => {
        query('SELECT * FROM short_keys WHERE short = ? AND class_id = ?', [short, class_id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            resolve(results[0].user_id)
        }).catch((error) => {
            reject(error)
        })
    })
}

function getTokenByLogin(id, password) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM credentials
               WHERE user_id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            if (results[0].password === password) {
                query('SELECT token FROM authorization WHERE user_id =?', [id]).then((results, fields) => {
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
            reject(error)
        })
    })
}

function getUser(id) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM user
               WHERE id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            resolve(results[0])
        }).catch((error) => {
            reject(error)
        })
    })
}

function getClassByUserID(id) {
    return new Promise((resolve, reject) => {
        query("SELECT class_id FROM students_classes WHERE user_id = ?", [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, "error": `Class not found`})
                return
            }
            getClass(results[0].class_id).then(class_ => {
                resolve(class_)
            }).catch(error => {
                reject(error)
            })
        }).catch(error => {
            reject(error)
        })
    })
}

function getUsers(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM user" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (limit !== undefined ? " LIMIT " + limit : "") + (offset !== undefined ? " OFFSET " + offset : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject(error);
        })
    })
}

function getStudents(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM user where role = 1" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (limit !== undefined ? " LIMIT " + limit : "") + (offset !== undefined ? " OFFSET " + offset : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject(error);
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
            reject(error)
        })
    })
}

function getRooms(limit, offset, orderby) {
    return new Promise((resolve, reject) => {
        let queryString = "SELECT * FROM rooms" + (orderby !== undefined ? " ORDER BY " + orderby.keyword + " " + orderby.direction : "") + (offset !== undefined ? " OFFSET " + offset : "") + (limit !== undefined ? " LIMIT " + limit : "");
        query(queryString).then((results, fields) => {
            resolve(results);
        }).catch((error) => {
            reject(error);
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
            getUser(classObject.teacher_id).then((teacher) => {
                classObject.teacher = teacher
                if (classObject.sec_teacher_id !== null) {
                    getUser(classObject.sec_teacher_id).then((sec_teacher) => {
                        classObject.sec_teacher = sec_teacher
                        resolve(classObject)
                    }).catch((error) => {
                        reject(error)
                    })
                } else {
                    resolve(classObject)
                }
            }).catch((error) => {
                reject(error)
            })
        }).catch((error) => {
            reject(error)
        })
    })
}

function setStudentPresence(user_id, class_id, date, time_id, present_from, present_until) {
    return new Promise((resolve, reject) => {
        query("SELECT * FROM presence WHERE user_id = ? AND class_id = ? AND date = ? AND time_id = ?", [user_id, class_id, date, time_id]).then((results) => {
            if (results === 0) {
                query("INSERT INTO presence (user_id, class_id, date, date, time_id, present_until) VALUES (?, ?, ?, ?, ?, ?)", [user_id, class_id, date, time_id, present_from, present_until]).then(() => {
                    resolve()
                }).catch(error => reject(error))
            } else {
                query("UPDATE presence SET present_until = ? WHERE user_id = ? AND class_id = ? AND date = ? AND time_id = ?", [user_id, class_id, date, time_id, present_until]).then(() => {
                    resolve()
                }).catch(error => reject(error))
            }
        }).catch(error => reject(error))
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
            getUser(entry["user_id"]).then((user) => {
                entry["user"] = user
                resolve(entry)
            }).catch(() => {
                resolve(entry)
            })
        }).catch((error) => {
            reject(error)
        })
    })
}

let daysOfTheWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

function getSubjectsByClassIDAndDate(class_id, date){
    return new Promise((resolve, reject) => {
            let dayString = daysOfTheWeek[date.getDay()]
            let dateMillis = new Date(date.getTime() - (date.getTime() % 86400000)).getTime() // Get only date without hours in millis
            query("SELECT tab.*, times.*, rooms.short AS room_short, rooms.description AS room_description FROM timetable AS tab, times AS times, rooms AS rooms WHERE tab.class_id = ? AND tab.day = ? AND tab.time_id = times.time_id ORDER BY tab.time_id AND tab.room_id = rooms.id ASC", [class_id, dayString]).then((results_1 => {
                query("SELECT tab.*, times.*, rooms.short AS room_short, rooms.description AS room_description FROM substition AS tab, times AS times, rooms AS rooms WHERE tab.class_id = ? AND tab.day = ? AND tab.time_id = times.time_id ORDER BY tab.time_id AND tab.room_id = rooms.id ASC", [class_id, dayString, dateMillis]).then(results_2 => {
                    if (results_2.length === 0) {
                        resolve(results_1)
                    } else {
                        for (i = 0; i < results_2.length; i++) {
                            for (j = 0; j < results_1.length; j++) {
                                if (results_2[i].time_id === results_1[j].time_id) {
                                    results_1[j] = results_2[i]
                                }
                            }
                        }
                        for (i = 0; i < results_1.length; i++){
                            if (results_1[i].double_lesson === 1){
                                subject[i]["end_time"] = subject[i]["start_time"] + 2 * 2700000
                            } else {
                                subject[i]["end_time"] = subject[i]["start_time"] + 2700000
                            }
                        }
                        resolve(results_1)
                    }
                }).catch((error) => {
                    reject(error)
                })
            })).catch(error => {
                reject(error)
            })
        })
}

function getCurrentSubjectByClassID(id) {
getSubjectsByClassIDAndDate()
}

function getTodaysScheduleByClassID(id) {
    return new Promise((resolve, reject) => {
       getSubjectsByClassIDAndDate(id, new Date()).then((subjects) => {
           resolve(subjects)
       }).catch((error) => {
           reject(error)
       })
    })
}

function getTodayScheduleByUserID(id) {
    return new Promise((resolve, reject) => {
        getClassByUserID(id).then((class_) => {
            getTodaysScheduleByClassID(class_.id).then((schedule) => {
                resolve(schedule)
            }).catch((error) => {
                reject(error)
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
                    let expiresDateInMillis = auth["expires"]
                    if (expiresDateInMillis < Date.now()) {
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
    getClassByUserID(auth.user_id).then(classObject => {
        let currentDate = new Date(new Date().getTime() - (new Date().getTime() % 86400000)).getTime()
        let date = new Date()
        let currentTime = 1000 * 60 * 60 * date.getHours() + 1000 * 60 * date.getMinutes()
        getCurrentSubjectByClassID(classObject.id).then(subject => {
            if (subject !== undefined) {
                setStudentPresence(auth.user_id, classObject.id, currentDate, subject.time_id, currentTime, subject.ends).then(() => {
                    res.status(200).send({message: "Marked student as present"})
                }).catch(error => {
                    res.status(error.code).send(error)
                })
            } else {
                res.status(404).send({error: "Theres no active subject for class id " + classObject.id})
            }
        }).catch(error => {
            res.status(error.code).send(error.error)
        })
    })

}, 1)

api("get", "/me/schedule/current_subject/", (req, res, auth) => {
    getClassByUserID(auth.user.id).then(class_ => {
        getCurrentSubjectByClassID(class_.id).then(subject => {
            res.send(subject)
        }).catch(error => res.status(error.code).send(error.error))
    }).catch(error => res.status(error.code).send(error.error))
}, 1)

api("get", "/me/schedule/", (req, res, auth) => {
    console.log(auth)
    getTodayScheduleByUserID(auth.user_id).then((schedule) => {
        res.send(schedule)
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 1)

api("get", "/me", (request, response, auth) => {
    let user = auth.user
    getClassByUserID(user.id).then(class_ => {
        user["class"] = class_
        response.send(user)
    }).catch(error => {
        response.send(user)
    })
}, 1)

api("get", "/users", (request, response) => {
    let limit = request.query.limit, offset = request.query.offset, orderby = request.query.orderby;
    if (orderby !== undefined) {
        orderby = JSON.parse(orderby)
        if (orderby["keyword"] === undefined && orderby["direction"] === undefined) {
            response.status(400).send({error: "orderby keyword and direction (ASC, DESC) must be specified"})
            return
        }
    }
    getUsers(limit, offset, orderby).then((users) => {
        response.send(users);
    }).catch((error) => {
        response.status(error.code).send({error: error.error});
    })
}, 2)

api("get", "/users/:id", (request, response) => {
    const id = parseInt(request.params.id);

    getUser(id).then((user) => {
        response.send(user);
    }).catch((error) => {
        response.status(error.code).send({error: error.error});
    })
}, 2)

api("get", "/rooms/:id", (request, response) => {
    const id = parseInt(request.params.id);

    getRoom(id).then((user) => {
        response.send(user);
    }).catch((error) => {
        response.status(error.code).send({error: error.error});
    })
}, 1)


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

        query("SELECT * FROM user WHERE id =?", [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "user not found"});
            }
            let token = ""
            for (let i = 0; i < 36; i++) {
                token += tokenChars[randomInt(0, tokenChars.length - 1)]
            }
            query("select * from authorization WHERE user_id =?", [id]).then((results_, fields_) => {

                let queryString = 'UPDATE authorization SET token =? WHERE user_id =?'

                if (results_.length === 0) {
                    queryString = 'INSERT INTO authorization (token, user_id, level) VALUES (?,?, 1)'
                }
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

function createUser(firstname, secondname, lastname, role, short_name) {

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

    query("SELECT * FROM user WHERE id =?", [req.body.id]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Student not found"})
            return
        }

        query('SELECT * from credentials WHERE user_id =?', [req.body.id]).then((results_, fields_) => {
            let queryString = "UPDATE credentials SET password =? WHERE user_id =?"
            if (results_.length === 0) {
                queryString = "INSERT INTO credentials (password, user_id) VALUES (?,?)"
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
    query("SELECT class_id FROM students_classes WHERE user_id = ?", [studentID]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        getClass(results[0].class_id).then(classData => {
            res.status(200).send(classData);
        }).catch(error => {
            res.status(error.code).send({error: error.error})
        })
    }).catch(error => {
        res.status(error.code).send({error: error.error})
    })
}, 1)


api("get", "/shortkey/:class_id/:short", (req, res) => {
    let class_id = parseInt(req.params.class_id), short = req.params.short;
    getUserIdByShortKey(short, class_id).then(user_id => {
        res.status(200).send({user_id: user_id})
    }).catch((error) => res.status(error.code).send({error: error.error}))
})


api("get", "/", (request, response) => {
    response.send(endpoints)
})

app.listen(8080)

