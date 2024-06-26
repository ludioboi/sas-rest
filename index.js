/*
 * Copyright (c) 2024.
 * @author: Frederic Wild
*/


// Load libraries. if fails, exit the program

let mysql
let express
let logger
let database
let websocket
let nodeServer
let app

// Settings and infos as const
const HTTP_PORT = 3330
const WEBSOCKET_PORT = 3331
const MYSQL_PORT = 3306

const sqlConfig = {
    host: "127.0.0.1",
    port: MYSQL_PORT,
    user: "backend",
    password: "saks-bbs2",
    database: "sas"
}

try {
    mysql = require("mysql")
    express = require("express")
    app = express()
    logger = require("./logger.js")
    const {Server} = require("socket.io")
    websocket = new Server(WEBSOCKET_PORT)
} catch (error) {
    console.error("Could not load libraries. " + error)
    console.log("exiting...")
    process.exit(-1)
}
logger.info("Loaded libraries")

Date.prototype.getOnlyDateMillis = function () {
    return new Date(this.toDateString()).getTime();
}
Date.prototype.getOnlyTimeMillis = function () {
    return 1000 * 60 * 60 * this.getHours() + 1000 * 60 * this.getMinutes()
}



app.use(express.json())

let socketConnections = []
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

database = mysql.createPool(sqlConfig)

//On query, a new connection to the database is created
database.on('connection', (connection) => {
    connection.on('error', (error) => {
        logger.error("Error on thread id " + connection.threadId + ": " + error)
    })
})

//Creates all necessary tables
function initMySQL() {
    query('CREATE TABLE IF NOT EXISTS students_classes (user_id bigint(30) PRIMARY KEY NOT NULL, class_id int not null)').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS classes (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'short VARCHAR(15) NOT NULL, ' +
        'description VARCHAR(255), ' +
        'teacher_id INT NOT NULL,' +
        'sec_teacher_id INT);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS user (id bigint(30) AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'firstname VARCHAR(255) NOT NULL, ' +
        'secondname VARCHAR(255), ' +
        'lastname VARCHAR(255) NOT NULL, ' +
        'short_name VARCHAR(5), ' +
        'role int not null);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS rooms (id INT AUTO_INCREMENT NOT NULL PRIMARY KEY, ' +
        'short_name VARCHAR(15) NOT NULL, ' +
        'description VARCHAR(255));').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS credentials (user_id bigint(30) NOT NULL PRIMARY KEY, ' +
        'password VARCHAR(25));').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS authorization (user_id bigint(30) not null primary key, token VARCHAR(36) not null, level int not null, expires int null);').catch(error => console.error(error))
    query('CREATE TABLE IF NOT EXISTS short_keys (short_key varchar(4) not null, user_id LONG);').catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS timetable (class_id int not null, room_id int not null, time_id int not null, teacher_id int not null, subject varchar(16) not null, day VARCHAR(5) not null, double_lesson boolean)").catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS substition (class_id int not null, room_id int, time_id int not null, teacher_id int, subject varchar(16), day VARCHAR(5) not null, date int not null, double_lesson boolean)").catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS times (time_id int not null, start_time int not null)").catch(error => console.error(error))
    query("CREATE TABLE IF NOT EXISTS presence (user_id bigint(30) not null, time_id int not null, date bigint(30) not null, present_from bigint(30) not null, present_until bigint(30) not null, room_id int not null)").catch(error => console.error(error))


}

initMySQL()


// Functions to process sql requests, returns a Promise for async work

function getUserIDAndTokenByShortKey(short, class_id) {
    return new Promise((resolve, reject) => {
        query('SELECT a.token, s.user_id FROM short_keys AS s, authorization AS a, students_classes AS c WHERE s.short_key = ? AND c.user_id = s.user_id AND c.class_id = ? AND a.user_id = s.user_id', [short, class_id]).then((results, fields) => {
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

function getTokenByLogin(id, password) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM credentials
               WHERE user_id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }

            if (results[0].password === undefined || results[0].password === null || results[0].password === "") {
                query('SELECT token FROM authorization WHERE user_id =?', [id]).then((results, fields) => {
                    if (results.length === 0) {
                        reject({code: 401, error: "Token not found"})
                        return
                    }
                    resolve({code: 303, token: results[0].token})
                }).catch(error => {
                    reject(error)
                })
                return;
            }
            if (results[0].password === password) {
                query('SELECT token FROM authorization WHERE user_id =?', [id]).then((results, fields) => {
                    if (results.length === 0) {
                        reject({code: 401, error: "Token not found"})
                        return
                    }
                    resolve({code: 200, token: results[0].token})
                }).catch(error => {
                    reject(error)
                })
            } else {
                reject({code: 401, error: "Wrong password"})
            }
        }).catch((error) => {
            reject(error)
        })
    })
}

function getUserByID(id, classObject=false) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM user
               WHERE id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 404, error: "Entry not found"})
                return
            }
            let user = results[0]
            if (classObject) {
                getClassByUserID(id).then((result) => {
                    user["class"] = result
                    resolve(user)
                }).catch(error => {
                    resolve(user)
                })
            } else {
                resolve(user)
            }

        }).catch((error) => {
            reject(error)
        })
    })
}

function getClassByUserID(id) {
    return new Promise((resolve, reject) => {
        query("SELECT class_id FROM students_classes WHERE user_id = ?", [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 331, "error": `Class not found`})
                return
            }
            getClassByID(results[0].class_id).then(class_ => {
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

function getClassByID(id) {
    return new Promise((resolve, reject) => {
        query(`SELECT *
               FROM classes
               WHERE id = ?`, [id]).then((results, fields) => {
            if (results.length === 0) {
                reject({code: 332, error: "Entry not found"})
                return
            }

            let classObject = results[0]
            getUserByID(classObject.teacher_id).then((teacher) => {
                classObject.teacher = teacher
                if (classObject.sec_teacher_id !== null) {
                    getUserByID(classObject.sec_teacher_id).then((sec_teacher) => {
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

function isStudentPresent(user_id) {
    return new Promise((resolve, reject) => {
        getClassByUserID(user_id).then(classObject => {
            getCurrentSubjectByClassID(classObject.id).then(subject => {
                let currDate = new Date()
                let currDateInMillis = currDate.getOnlyDateMillis()
                let currTimeInMillis = currDate.getOnlyTimeMillis()
                query("SELECT * FROM presence WHERE user_id = ? AND date = ? AND present_from >= ? AND present_until >= ? AND time_id = ?", [user_id, currDateInMillis, subject.start_time, currTimeInMillis, subject.time_id]).then((results) => {
                    if (results.length === 0) {
                        resolve(false)
                    } else {
                        if (results[0].present_from !== 0 && results[0].present_until >= new Date().getOnlyTimeMillis()) {
                            resolve(results[0])
                        } else {
                            resolve(false)
                        }
                    }
                }).catch(error => {
                    reject(error)
                })
            }).catch(error => {
                reject(error)
            })
        }).catch(error => {
            reject(error)
        })
    })
}

function setStudentPresence(user_id, date, time_id, present_from, present_until, room_id) {
    return new Promise((resolve, reject) => {
        query("SELECT * FROM presence WHERE user_id = ? AND date = ? AND time_id = ?", [user_id, date, time_id]).then((results) => {
            if (results.length === 0) {
                query("INSERT INTO presence (user_id, date, time_id, present_from, present_until, room_id) VALUES (?, ?, ?, ?, ?, ?)", [user_id, date, time_id, present_from, present_until, room_id]).then(() => {
                    resolve()
                }).catch(error => {
                    reject(error)
                })
            } else {
                query("UPDATE presence SET present_until = ?, present_from = ? WHERE user_id = ? AND date = ? AND time_id = ?", [present_until, present_from, user_id, date, time_id]).then(() => {
                    resolve()
                }).catch(error => {
                    reject(error)
                })
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
            reject({code: error.code, error: error});
        })
    })
}

function getAuthorizationByToken(token, ignoreCredentials = false) {
    return new Promise((resolve, reject) => {
        query("SELECT * FROM authorization AS a, credentials AS c where a.token = ? AND a.user_id = c.user_id", [token]).then((results) => {
            if (results.length === 0) {
                reject({code: 404, error: "Token does not exists"})
                return
            }
            if (results[0].password === null && !ignoreCredentials) {
                reject({code: 303, error: "Please set a new password"})
                return
            }
            let entry = results[0]
            getUserByID(entry["user_id"]).then((user) => {
                entry["user"] = user
                resolve(entry)
            }).catch((error) => {
                resolve(entry)
            })
        }).catch((error) => {
            reject(error)
        })
    })
}

let daysOfTheWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


function getSubjectsByClassIDAndDate(class_id, date) {
    return new Promise((resolve, reject) => {
        let dayString = daysOfTheWeek[date.getDay()]
        let dateMillis = date.getOnlyDateMillis() // Get only date without hours and minutes in millis
        query("SELECT tab.*, times.*, rooms.short_name AS room_short, rooms.description AS room_description FROM timetable AS tab, times AS times, rooms AS rooms WHERE tab.class_id = ? AND tab.day = ? AND tab.time_id = times.time_id AND tab.room_id = rooms.id ORDER BY tab.time_id  ASC", [class_id, dayString]).then((results_1 => {
            query("SELECT tab.*, times.*, rooms.short_name AS room_short, rooms.description AS room_description FROM substition AS tab, times AS times, rooms AS rooms WHERE tab.class_id = ? AND tab.day = ? AND tab.time_id = times.time_id AND tab.room_id = rooms.id ORDER BY tab.time_id ASC", [class_id, dayString, dateMillis]).then(results_2 => {
                if (results_2.length !== 0) {
                    //ToDo: fix
                    for (i = 0; i < results_2.length; i++) {
                        let timePos = getPosByTimeID(results_1, results_2[i].time_id)
                        if (timePos !== -1) {
                            console.log(timePos)
                            results_1.splice(timePos, 1, results_2[i]);
                            console.log(results_1[i])
                            console.log("replaced in timetable")
                        } else {
                            results_1.push(results_2[i])
                            console.log("added to timetable")
                        }
                    }
                }
                for (i = 0; i < results_1.length; i++) {
                    if (results_1[i].double_lesson === 1) {
                        results_1[i]["end_time"] = results_1[i]["start_time"] + 2 * 2700000
                    } else {
                        results_1[i]["end_time"] = results_1[i]["start_time"] + 2700000
                    }
                }
                resolve(results_1)
            }).catch((error) => {
                reject(error)
            })
        })).catch(error => {
            reject(error)
        })
    })
}

function getCurrentSubjectByClassID(id) {
    let currentDate = new Date()
    return new Promise((resolve, reject) => {
        getSubjectsByClassIDAndDate(id, currentDate).then(subjects => {
            let currentTimeMillis = new Date().getOnlyTimeMillis()
            for (i = 0; i < subjects.length; i++) {
                if (subjects[i].start_time < currentTimeMillis && subjects[i].end_time > currentTimeMillis) {
                    resolve(subjects[i])
                    return;
                }
            }
            reject({code: 404, error: "No current subject found"})
        })
    })
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
            }).catch(error => {
                reject(error)
            })
        }
    })
}


function setStudentsClass(user_id, class_id) {
    return new Promise((resolve, reject) => {
        query("INSERT INTO students_classes" +
            "(user_id, class_id)" +
            " VALUES " +
            "(?, ?) " +
            "ON DUPLICATE KEY UPDATE " +
            "class_id = ?", [user_id, class_id, class_id]).then(results => {
            resolve()
        }).catch(error => {
            reject(error)
        })
    })
}

function resetPasswordForUserID(user_id) {
    return new Promise((resolve, reject) => {
        query("SELECT user_id FROM credentials WHERE user_id = ?", [user_id]).then(results => {
            if (results.length !== 0) {
                query("UPDATE credentials SET password = NULL WHERE user_id = ?", [user_id]).then(results => {
                    if (results.rowsAffected !== 0) {
                        resolve()
                    } else {
                        reject({code: 503, error: "Could not reset password"})
                    }
                })
            } else {
                reject({code: 404, error: "Entry not found"})
            }
        }).catch((error) => {
            reject(error)
        })
    })
}

function getStudentPresence(user_id, start_date = new Date(0), end_date = new Date()) {
    return new Promise((resolve, reject) => {
        let startDateMillis = start_date
        let endDateMillis = end_date
        if (end_date instanceof Date){
            endDateMillis = end_date.getOnlyDateMillis()
        }
        if (start_date instanceof Date){
            startDateMillis = start_date.getOnlyDateMillis()
        }
        query("SELECT * FROM presence WHERE user_id = ? AND date >= ? AND ? >= date", [user_id, startDateMillis, endDateMillis]).then(result => {
            resolve(result)
        }).catch((error) => {
            reject(error)
        })
    })
}

function getStudentsByClassID(class_id){
    return new Promise((resolve, reject) => {
        query("SELECT u.* FROM students_classes AS c, user AS u WHERE class_id = ? AND u.id = c.user_id", [class_id]).then(result => {
            resolve(result)
        }).catch((error) => {
            reject(error)
        })
    })
}
function getPosByTimeID(schedule, id){
    for (i = 0; i < schedule.length; i++){
        if (schedule[i].time_id === id){
            return i
        }
    }
    return -1
}

function getTodaysScheduleByTeacherID(teacher_id){
    return new Promise((resolve, reject) => {
        let date = new Date()
        let dayString = daysOfTheWeek[date.getDay()]
        let dateMillis = date.getOnlyDateMillis() // Get only date without hours and minutes in millis
        query("SELECT tab.*, times.*, rooms.short_name AS room_short, rooms.description AS room_description FROM timetable AS tab, times AS times, rooms AS rooms WHERE tab.teacher_id = ? AND tab.day = ? AND tab.time_id = times.time_id AND tab.room_id = rooms.id ORDER BY tab.time_id ASC", [teacher_id, dayString]).then((results_1 => {
            query("SELECT tab.*, times.*, rooms.short_name AS room_short, rooms.description AS room_description FROM substition AS tab, times AS times, rooms AS rooms WHERE tab.teacher_id = ? AND tab.day = ? AND tab.time_id = times.time_id AND tab.room_id = rooms.id ORDER BY tab.time_id ASC", [teacher_id, dayString, dateMillis]).then(results_2 => {
                if (results_2.length !== 0) {
                    for (i = 0; i < results_2.length; i++) {
                        let timePos = getPosByTimeID(results_1, results_2[i])
                        if (timePos !== -1) {
                            results_1.splice(timePos, 1, results_2[i]);
                        } else {
                            results_1.push(results_2[i])
                        }
                    }
                }
                for (i = 0; i < results_1.length; i++) {
                    if (results_1[i].double_lesson === 1) {
                        results_1[i]["end_time"] = results_1[i]["start_time"] + 2 * 2700000
                    } else {
                        results_1[i]["end_time"] = results_1[i]["start_time"] + 2700000
                    }
                }
                resolve(results_1)
            }).catch((error) => {
                reject(error)
            })
        })).catch(error => {
            reject(error)
        })
    })
}


function getCurrentClassByTeacherID(teacher_id){
    return new Promise((resolve, reject) => {
        getTodaysScheduleByTeacherID(teacher_id).then((results_1) => {
            let currTimeInMillis = new Date().getOnlyTimeMillis()
            for (i = 0; i < results_1.length; i++) {
                if (results_1[i].start_time <= currTimeInMillis && currTimeInMillis <= results_1[i].end_time) {
                    resolve(results_1[i]["class_id"])
                    return
                }
            }
        }).catch((error) => {
            reject(error)
        })
    })
}


function sendPresentStudentToTeacherID(teacher_id, user, loginTime=0, present_until, date) {
    let jsonObject = {
        "user": user,
        "present_from": loginTime,
        "date": date,
        "present_until": present_until
    }
    for (let i in socketConnections) {
        let socket = socketConnections[i]
        if (socket.user_id === teacher_id) {
            socket.socket.emit("student", JSON.stringify(jsonObject))
        }
    }

}

function sendCurrentPresentStudentsToTeacher(class_id) {
    return new Promise((resolve, reject) => {
        getCurrentSubjectByClassID(class_id).then(subject => {
            getStudentsByClassID(class_id).then(students => {
                let currDateInMillis = new Date().getOnlyDateMillis()
                let currTimeInMillis = new Date().getOnlyTimeMillis()
                for (let i = 0; i < students.length; i++) {
                    query("SELECT * FROM presence WHERE date = ? AND present_from >= ? AND present_until >= ? AND user_id = ?", [currDateInMillis, subject.start_time, currTimeInMillis, students[i].id]).then(presence => {
                        if (presence.length === 1) {
                            sendPresentStudentToTeacherID(subject.teacher_id, students[i].id, presence[0].present_from, presence[0].present_until, presence[0].date)
                        } else if (presence.length === 0) {
                            sendPresentStudentToTeacherID(subject.teacher_id, students[i].id, 0, subject.end_time, new Date().getOnlyDateMillis())
                        }
                        resolve()
                    }).catch((error) => {
                        reject(error)
                    })
                }
            }).catch((error) => {
                reject(error)
            })
        }).catch((error) => {
            reject(error)
        })
    })
}

// Receive HTTP request and process them
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
                console.log(error)
                logger.info(`API CALL: ${consoleCallColorFormat[call] + call.toUpperCase() + logger.Colors.RESET} ${"'" + logger.Colors.FOREGROUND_BLUE + logger.Colors.UNDERSCORE + endpoint + logger.Colors.RESET + "'"} declined`)
                if (error.code === undefined) {
                    error.code = 500
                }
                response.status(error.code).send(error)
            })
        } else {
            logger.info(`API CALL: ${consoleCallColorFormat[call] + call.toUpperCase() + logger.Colors.RESET} ${"'" + logger.Colors.FOREGROUND_BLUE + logger.Colors.UNDERSCORE + endpoint + logger.Colors.RESET + "'"} accepted`)
            func(request, response)
        }
    })
}

api("post", "/me/present", (req, res, auth) => {
    if (req.query.room_id === undefined) {
        res.status(400).send({error: "No room_id provided", code: 400})
        return
    }
    let room_id = req.query.room_id
    let body = req.body

    getClassByUserID(auth.user_id).then(classObject => {
        let date = new Date()
        let currentDate = date.getOnlyDateMillis()
        let currentTime = date.getOnlyTimeMillis()
        getCurrentSubjectByClassID(classObject.id).then(subject => {
            if (subject !== undefined) {
                if (subject.room_id != room_id) {
                    res.status(400).send({error: "Wrong room id", code: 400})
                    return
                }
                isStudentPresent(auth.user_id).then(isStudentPresent => {
                    if (isStudentPresent) {
                        if (!body){
                            res.status(330).send({error: "No body provided", code: 330})
                            return
                        }
                        switch (body.action) {
                            case "set_present_until":
                                setStudentPresence(auth.user_id, currentDate, subject.time_id, isStudentPresent.present_from, currentTime, room_id).then(()=>{
                                    sendPresentStudentToTeacherID(subject.teacher_id, auth.user_id, isStudentPresent.present_from, currentTime, currentDate)
                                    res.status(200).send({message: "Marked student as absent"})
                                }).catch((err) => {
                                    res.status(err.code).send(err)
                                })
                                break;
                            case "set_present_from":
                                setStudentPresence(auth.user_id, currentDate, subject.time_id, currentTime, subject.end_time, room_id).then(()=>{
                                    sendPresentStudentToTeacherID(subject.teacher_id, auth.user_id, currentTime, subject.end_time, currentDate)
                                    res.status(200).send({message: "Marked student as present"})
                                }).catch((err) => {
                                    res.status(err.code).send(err)
                                })
                                break;
                            case "set_absent":
                                setStudentPresence(auth.user_id, currentDate, subject.time_id, 0, subject.end_time, room_id).then(()=>{
                                    sendPresentStudentToTeacherID(subject.teacher_id, auth.user_id, 0, subject.end_time, currentDate)
                                    res.status(200).send({message: "Marked student as absent"})
                                }).catch((err) => {
                                    res.status(err.code).send(err)
                                })
                                break;
                            default:
                                res.status(330).send({error: "No body provided", code: 330})
                                break;
                        }

                    } else {
                        setStudentPresence(auth.user_id, currentDate, subject.time_id, currentTime, subject.end_time, room_id).then(() => {
                            sendPresentStudentToTeacherID(subject.teacher_id, auth.user_id, currentTime, subject.end_time, currentDate)
                            res.status(200).send({message: "Marked student as present"})
                        }).catch(error => {
                            if (error.code === undefined) {
                                error.code = 500
                            }
                            res.status(error.code).send(error)

                        })
                    }
                })


            } else {
                res.status(404).send({error: "Theres no active subject for class id " + classObject.id})
            }
        }).catch(error => {
            res.status(error.code).send(error)
        })
    }).catch((error) => {
        res.status(error.code).send(error)
    })

}, 1)

api("get", "/me/schedule/current_subject/", (req, res, auth) => {
    getClassByUserID(auth.user.id).then(class_ => {
        getCurrentSubjectByClassID(class_.id).then(subject => {
            res.send(subject)
        }).catch(error => res.status(error.code).send(error))
    }).catch(error => res.status(error.code).send(error))


}, 1)

api("get", "/me/schedule/", (req, res, auth) => {
    if (auth.user.role === 2) {
        getTodaysScheduleByTeacherID(auth.user.id).then((schedule) => {
            res.send(schedule)
        }).catch(error => {
            res.status(error.code).send(error)
        })
    } else {
        getTodayScheduleByUserID(auth.user_id).then((schedule) => {
            res.send(schedule)
        }).catch(error => {
            res.status(error.code).send(error)
        })
    }

}, 1)

api("get", "/me/is_present", (req, res, auth) => {
    isStudentPresent(auth.user_id).then(isPresent => {
        if (isPresent) {
            res.send({present: true})
        } else {
            res.send({present: false})
        }
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 1)

api("get", "/me", (request, response, auth) => {
    let user = auth.user
    getClassByUserID(auth.user_id).then(class_ => {

        user["class"] = class_
        getCurrentSubjectByClassID(class_.id).then(subject => {

            user["subject"] = subject
            isStudentPresent(user.id).then(isPresent => {

                user["is_present"] = !(!isPresent)
                response.send(user)

            }).catch((error) => {
                user["is_present"] = false
                response.send(user)
            })
        }).catch(() => {
            response.send(user)
        })
    }).catch(error => {
        response.send(user)
    })
}, 1)

api("post", "/student/:user_id/presence", (request, response, auth) => {
    let user_id = request.params.user.id
    let body = request.body
    if (body["present_from"] === undefined || body["present_until"] === undefined || body["room_id"] === undefined || body["time_id"] === undefined || body["date"] === undefined){
        response.status(330).send({error: "No body provided", code: 330})
        return
    }
    let present_from = body["present_from"]
    let present_until = body["present_until"]
    let room_id = body["room_id"]
    let time_id = body["time_id"]
    let date = new Date(body["date"]).getOnlyDateMillis()
    setStudentPresence(user_id, date, time_id, present_from, present_until, room_id).then(() => {
        response.status(200).send({message: "Marked student as present"})
        sendPresentStudentToTeacherID(auth.user_id, user_id, present_from, present_until, date)
    }).catch((error) => {
        response.status(error.code).send(error)
    })
}, 2)

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
        response.status(error.code).send(error);
    })
}, 2)

api("get", "/users/:id", (request, response) => {
    const id = parseInt(request.params.id);

    getUserByID(id, true).then((user) => {
        response.send(user);
    }).catch((error) => {
        response.status(error.code).send(error);
    })
}, 2)

api("get", "/rooms/:id", (request, response) => {
    const id = parseInt(request.params.id);

    getRoom(id).then((user) => {
        response.send(user);
    }).catch((error) => {
        response.status(error.code).send(error);
    })
}, 1)


api("get", "/classes/:id", (req, res) => {
    const id = parseInt(req.params.id);

    getClassByID(id).then((classObject) => {
        res.send(classObject);
    }).catch(error => {
        res.status(error.code).send(error);
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
    getClasses(limit, offset, orderby).then((classes) => {
        res.send(classes);
    }).catch((error) => {
        res.status(error.code).send(error);
    })
})


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
        res.status(error.code).send(error);
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
        res.status(error.code).send(error);
    })
}, 2)

api("put", "/login", (req, res) => {
    let body = req.body
    let id = body.id, password = body.password
    getTokenByLogin(id, password).then((result) => {
        res.status(result.code).send({token: result.token})
    }).catch((error) => {
        res.status(error.code).send(error)
    })
})


const tokenChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%"

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function setPermissionsLevelForUserID(userID, level) {
    return new Promise((resolve, reject) => {
        query("UPDATE authorization SET level =? WHERE user_id =?", [level, userID]).then(() => {
            resolve();
        }).catch(error => {
            reject(error);
        })
    })
}

function generateTokenForUserID(id) {
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
            }).catch(error => {
                reject(error)
            })
        }).catch(error => {
            reject(error);
        })
    })
}


api("post", "/login", (req, res) => {

    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }


    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }
    if (req.body.password === undefined) {
        res.status(400).send({error: "password is required"})
        return
    }

    getAuthorizationByToken(req.headers["authorization"], true).then(auth => {
        let password = req.body.password, user_id = auth.user.id
        if (auth.user !== undefined) {
            query('SELECT * from credentials WHERE user_id =?', [user_id]).then((results_, fields_) => {
                let queryString = "UPDATE credentials SET password =? WHERE user_id =?"
                if (results_.length === 0) {
                    queryString = "INSERT INTO credentials (password, user_id) VALUES (?,?)"
                }
                query(queryString, [password, user_id]).then(() => {
                    generateTokenForUserID(user_id).then(token => {
                        res.status(200).send({token: token});
                    }).catch(error => {
                        res.status(error.code).send(error)
                    })
                }).catch(error => {
                    res.status(error.code).send(error)
                })
            }).catch(error => {
                res.status(error.code).send(error)
            })
        } else {
            res.status(404).send({status: 404, error: "Could not find user for this auth token"})
        }
    }).catch(error => {
        res.status(error.code).send(error)
    })
})

api("post", "/user", (req, res) => {
    let body = req.body
    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }
    if (body.firstname === undefined || body.lastname === undefined) {
        res.status(400).send({error: "firstname and lastname is required"})
        return
    }
    let firstname = "'" + body.firstname + "'", lastname = "'" + body.lastname + "'"
    let id = "NULL", role = "1", short_name = "NULL", secondname = "NULL"
    if (body.id !== undefined) {
        id = "'" + body.id + "'"
    }
    if (body.role !== undefined) {
        role = body.role
    }
    if (body.short_name !== undefined) {
        short_name = "'" + body.short_name + "'"
    }
    if (body.secondname !== undefined) {
        secondname = "'" + body.secondname + "'"
    }

    let queryString = `INSERT INTO user (id, firstname, secondname, lastname, short_name, role) VALUES (${id}, ${firstname}, ${secondname}, ${lastname}, ${short_name}, ${role})`
    query(queryString).then((result) => {
        generateTokenForUserID(result.insertId).then(token => {
            query("INSERT INTO credentials (user_id, password) VALUES (?, ?)", [result.insertId, ""]).then(() => {
                if (body.level !== undefined && body.level !== 1) {
                    setPermissionsLevelForUserID(result.insertId, body.level).then(() => {
                        res.status(200).send({message: "OK", status: 200, user_id: result.insertId})
                    }).catch((error) => {
                        res.status(error.code).send(error)
                    })
                    return;
                }
                res.status(200).send({status: 200, message: "OK", user_id: result.insertId})
            })
        }).catch(error => {
            res.status(error.code).send(error)
        })
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("post", "/class", (req, res) => {
    let body = req.body
    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }

    //CHECK IF REQUIRED FIELDS ARE GIVEN
    if (body.short === undefined || body.teacher_id === undefined) {
        res.status(400).send({error: "short and teacher_id are required"})
        return
    }

    //REQUIRED FIELDS
    let short = "'" + body.short + "'", teacher_id = "'" + body.teacher_id + "'"

    //OPTIONAL FIELDS
    let desciption = "NULL", sec_teacher_id = "NULL"
    if (body.description !== undefined) {
        id = "'" + body.description + "'"
    }
    if (body.sec_teacher_id !== undefined) {
        sec_teacher_id = body.sec_teacher_id
    }


    let queryString = `INSERT INTO classes (short, teacher_id, description, sec_teacher_id) VALUES (${short}, ${teacher_id}, ${desciption}, ${sec_teacher_id})`
    query(queryString).then((result) => {
        res.status(200).send({status: 200, message: "OK", class_id: result.insertId})
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("post", "/times", (req, res) => {
    let body = req.body
    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }

    //CHECK IF REQUIRED FIELDS ARE GIVEN
    if (body.time_id === undefined || body.start_time === undefined) {
        res.status(400).send({error: "time_id and start_time are required"})
        return
    }

    //REQUIRED FIELDS
    let time_id = "" + body.time_id + "", start_time = "" + body.start_time + ""

    //OPTIONAL FIELDS


    let queryString = `INSERT INTO times (time_id, start_time) VALUES (${time_id}, ${start_time})`
    query(queryString).then((result) => {
        res.status(200).send({status: 200, message: "OK", time_id: result.insertId})
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("post", "/short_key", (req, res) => {
    let body = req.body
    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }

    //CHECK IF REQUIRED FIELDS ARE GIVEN
    if (body.user_id === undefined || body.short_key === undefined) {
        res.status(400).send({error: "user_id and short_key are required"})
        return
    }

    //REQUIRED FIELDS
    let user_id = "" + body.user_id + "", short_key = "'" + body.short_key + "'"

    //OPTIONAL FIELDS


    let queryString = `INSERT INTO short_keys (user_id, short_key) VALUES (${user_id}, ${short_key})`
    query(queryString).then((result) => {
        res.status(200).send({status: 200, message: "OK"})
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("post", "/room", (req, res) => {
    let body = req.body
    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }

    //CHECK IF REQUIRED FIELDS ARE GIVEN
    if (body.short_name === undefined || body.description === undefined) {
        res.status(400).send({error: "short_name and description are required"})
        return
    }

    //REQUIRED FIELDS
    let short_name = "'" + body.short_name + "'", description = "'" + body.description + "'"

    //OPTIONAL FIELDS
    let id = "NULL"
    if (body.id !== undefined) {
        id = "'" + body.id + "'"
    }

    let queryString = `INSERT INTO rooms (id, short_name, description) VALUES (${id}, ${short_name}, ${description})`
    query(queryString).then((result) => {
        res.status(200).send({status: 200, message: "OK", room_id: result.insertId})
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("post", "/schedule", (req, res) => {
    let body = req.body
    if (!req.is("application/json")) {
        res.status(415).send({error: "Content type must be application/json"})
        return
    }
    if (!(req.body instanceof Object)) {
        res.status(400).send({error: "Body must be type of object"})
        return
    }

    //CHECK IF REQUIRED FIELDS ARE GIVEN
    if (body.class_id === undefined || body.room_id === undefined || body.time_id === undefined || body.teacher_id === undefined || body.subject === undefined || body.day === undefined || body.double_lesson === undefined) {
        res.status(400).send({error: "class_id, room_id, time_id, teacher_id, subject, day, double_lesson are required"})
        return
    }

    //REQUIRED FIELDS
    let class_id = "" + body.class_id + "", room_id = "" + body.room_id + ""
    let time_id = "" + body.time_id + "", teacher_id = "" + body.teacher_id + ""
    let subject = "'" + body.subject + "'", day = "'" + body.day + "'"
    let double_lesson = "" + body.double_lesson + ""

    //OPTIONAL FIELDS

    let queryString = `INSERT INTO timetable (class_id, room_id, time_id, teacher_id, subject, day, double_lesson) VALUES (${class_id}, ${room_id}, ${time_id}, ${teacher_id}, ${subject}, ${day}, ${double_lesson})`
    query(queryString).then((result) => {
        res.status(200).send({status: 200, message: "OK"})
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("get", "/user/search", (req, res, auth) => {
    let q = req.query.q
    q = q.toLowerCase()
    q = "%" + q + "%"
    query("SELECT * FROM `user` WHERE LOWER(firstname) LIKE ? OR LOWER(secondname) LIKE ? OR LOWER(lastname) LIKE ? OR id LIKE ? OR LOWER(short_name) LIKE ? OR CONCAT(LOWER(firstname), \" \", LOWER(lastname)) LIKE ?", [q, q, q, q, q, q]).then((user) => {
        res.status(200).send(user)
    }).catch((error) => {
        res.status(error.code).send(error)
    })
}, 3)


api("get", "/students/:id/class", (req, res) => {
    const studentID = parseInt(req.params.id);
    query("SELECT class_id FROM students_classes WHERE user_id = ?", [studentID]).then((results, fields) => {
        if (results.length === 0) {
            res.status(404).send({error: "Entry not found"})
            return
        }
        getClassByID(results[0].class_id).then(classData => {
            res.status(200).send(classData);
        }).catch(error => {
            res.status(error.code).send(error)
        })
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 1)


api("get", "/shortkey/:class_id/:short", (req, res) => {
    let class_id = parseInt(req.params.class_id), short = req.params.short;
    getUserIDAndTokenByShortKey(short, class_id).then(result => {
        res.status(200).send(result)
    }).catch((error) => res.status(error.code).send(error))
})

api("post", "/user/:id/class", (req, res) => {
    if (!req.is("application/json")) {
        res.status(400).send({error: "Content-Type must be application/json"})
        return
    }
    let body = req.body
    if (body["class_id"] === undefined) {
        res.status(400).send({error: "class_id is required"})
        return;
    }
    setStudentsClass(req.params.id, body["class_id"]).then(() => {
        res.status(200).send()
    }).catch(error => {
        res.status(error.code).send(error)
    })
}, 3)

api("post", "/user/:id/reset_password", (req, res, auth) => {
    getUserByID(req.params.id).then(() => {
        resetPasswordForUserID(req.params.id).then(() => {
            res.status(205).send()
        }).catch((error) => {
            res.status(error.code).send(error)
        })
    }).catch((error) => {
        req.status(error.code).send(error)
    })
}, 3)

api("get", "/user/:id/presence", (req, res, auth) => {
    getStudentPresence(req.params.id, req.query.start_date, req.query.end_date).then(result => {
        res.send(result)
    }).catch((error) => {
        res.status(error.code).send(error)
    })
}, 2)


api("get", "/", (request, response) => {
    response.send(endpoints)
})

websocket.on("connection", (socket) => {
    socket.on("token", (token) => {
        getAuthorizationByToken(token, true).then((auth) => {
            if (auth.level >= 2 && auth.user_id !== undefined && auth.user.role === 2) {
                socketConnections.push({user_id: auth.user_id, socket: socket})
                logger.info("Teacher connected: " + token)
                getCurrentClassByTeacherID(auth.user_id).then((class_id) => {
                    sendCurrentPresentStudentsToTeacher(class_id).then(() => {
                    }).catch((error) => {
                        console.log(error)
                    })
                }).catch((error) => {
                    console.log(error)
                })
            }
        }).catch((error) => {
            console.log(error)
        })
    })
    socket.on("disconnect", () => {
        for (let i = 0; i < socketConnections.length; i++) {
            if (socketConnections[i].socket === socket) {
                socketConnections.splice(i, 1)
            }
        }
    })
})

app.listen(HTTP_PORT)

