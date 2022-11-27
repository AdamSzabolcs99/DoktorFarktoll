var uuid = require('uuid-random');
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const sessions = require("express-session");
const MySQLStore = require("express-mysql-session")(sessions);
const WebSocket = require('ws');
const url = require('url');
const cors = require('cors');
const bcrypt = require('bcrypt');
const {taxiRoutes, busRoutes, metroRoutes, boatRoutes, graphPoints} = require("./vehicleRoutes.js");
const connection = require("./dbConnection.js");
const { password } = require('./conData.js');
const app = (module.exports = express());
app.engine(".html", require("ejs").__express);
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.set("view engine", "html");
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors());
const saltRounds = 10;
var sessionStore = new MySQLStore({}, connection);
const oneWeek = 1000 * 60 * 60 * 24 * 7;
var session;
const serv_port = 8080; //Websocket port
const site_port = 5000; //Website port

app.use(
    sessions({
      secret: "szoftverarchitekturak_verysecure",
      saveUninitialized: true,
      cookie: { maxAge: oneWeek },
      store: sessionStore,
      resave: false,
    })
);

app.get("/login", (req, res) => {
    res.render("login");
});
app.get("/register", (req, res) => {
    res.render("register");
});
app.get("/fakelogin/:username", (req, res) => {
    const username = req?.params?.username;
    session = req.session;
    session.userid = username;
    console.log(`Fake login as ${username}`);
    res.redirect("/");
});

/*
CREATE TABLE `scotlandyard`.`users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(45) NOT NULL,
  `password` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `username_UNIQUE` (`username` ASC) VISIBLE,
  UNIQUE INDEX `id_UNIQUE` (`id` ASC) VISIBLE);
*/

app.post("/login", (req, res) => {
    session = req.session;
    const username = req?.body?.username;
    const pass = req?.body?.password;
    const query = "SELECT * FROM users WHERE username=?;";
    const values = [username];
    connection.query(query, values, (err, results) => {
        JSON_results=JSON.parse(JSON.stringify(results));
        if(JSON_results.length===1) {
            const pwHash = JSON_results[0].password;
            bcrypt.compare(pass, pwHash, function(err, result) {
                if(result) {
                    session.userid = username;
                    res.send(`{"type":"SUCCESSFUL_LOGIN"}`);
                }
                else {
                    res.send("Invalid credentials.");
                }
            });
        }
        else {
            res.send("Invalid credentials.");
        }
    });
});

app.post("/register", (req, res) => {
    session = req.session;
    const username = req?.body?.username;
    const pass = req?.body?.password;
    const query = "SELECT * FROM users WHERE username=?;";
    const values = [username];
    connection.query(query, values, (err, results) => {
        JSON_results=JSON.parse(JSON.stringify(results));
        if(JSON_results.length===0) {
            bcrypt.hash(pass, saltRounds, function(err, hash) {
                const query = "INSERT INTO users (username, password) VALUES (?,?);";
                const values = [username,hash];
                connection.query(query, values, (err, results)=> {
                    if(JSON.parse(JSON.stringify(results)).insertId>=0){
                        res.send(`{"type":"SUCCESSFUL_REGISTRATION"}`);
                    }
                    else {
                        res.send(`{"type":"UNSUCCESSFUL_REGISTRATION"}`);
                    }
                });
            });
        }
        else {
            res.send("Already existing user.");
        }
    });
});



app.use((req, res, next) => {
    session = req.session;
    if (session.userid) {
      next();
    } else {
      res.redirect("/login");
    }
});

//Pages for logged in users
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});


app.get("/", (req, res) => {
    res.render("index");
});

//=====WEBSOCKET FUNCTIONS======
const wss = new WebSocket.WebSocketServer({port:serv_port}, ()=> {
    console.log('Server started')
})

/* 
    Random global variable list
*/
gameRoomVariables = {}

//<!-- MAP DATA, this should be independent from game room as these are constants
//The adjacency matrixes are not in use at the moment
//const graphPointPositions = [(0,0), (100,100), (150, 150), (200, 200)]; //pixel data for every graph point, not neccessary to be on the server side
const taxiMatrix = [
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
  ];
const metroMatrix = [
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
  ];
const busMatrix = [ //sor:honnan oszlop:hova
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
  ];

//-->

/* Msg to claim Mr. X role: {"type" : "CLAIM_MR_X"} */
/* stepMessage : {"type": "step", "toPos":3, "byVehicle": "taxi"} */

/*
Returns if the game has ended, if true, also modifies global variable "endMsg" with the ending message
*/
function endCheck(playerData, roundCount, roomID, roundEnded=false) {
    bobbyPositions = [];
    MrXPosition = -1;
    let ticketsNull = true;
    for (playerId in Object.keys(playerData)) {
        player = playerData[playerId];
        tickets = player.tickets;
        if(player.role==="bobby") {
            bobbyPositions.push(player.position);
            if(tickets.taxi > 0 || tickets.bus > 0 || tickets.metro > 0) {
                ticketsNull = false;
            }
        }
        else if(player.role==="X") {
            MrXPosition = player.position;
        }
    }
    if(bobbyPositions.includes(MrXPosition)) {
        gameRoomVariables[roomID].gameEnded = true;
        gameRoomVariables[roomID].endMsg = "Mr. X was caught, game over!";
        return true;
    }
    else if(ticketsNull) {
        gameRoomVariables[roomID].gameEnded = true;
        gameRoomVariables[roomID].endMsg = "Bobbies has run out of tickets, game over!";
        return true;
    }
    else if(roundCount>=24 && roundEnded) {
        gameRoomVariables[roomID].gameEnded = true;
        gameRoomVariables[roomID].endMsg = "End of the game, Mr. X wasn't caught!";
        return true;
    }
    return false;
}

function getMrXPosition(playerData) {
    for(k in Object.keys(playerData)) {
        if(playerData[k].role==="X") {
            return playerData[k].position;
        } 
    }
    return undefined;
}

function isMrX(id) {
    return;
}

function getMrXId(playerData) {
    for (k in Object.keys(playerData)) {
        if(playerData[k].role==="X") {
            return k;
        } 
    }
    return undefined;
}

function mrXStepped(playerData) {
    //return playerData[getMrXId(playerData)].stepped === 1;
    for(k in Object.keys(playerData)) {
        if(playerData[k].role==="X") {
            return playerData[k].stepped===1;
        } 
    }
    return undefined;
}

function notifyEveryone(msg) {
    wss.clients.forEach(function(client) {
        client.send(msg.toString());
     });
}

function broadcastVisibleState(roundCount, playerData) {
    const sendMrxPosRounds = [3,8,13,18];
    let results = []
    for (k in Object.keys(playerData)) {
        player = playerData[k];
        if(player.role === "bobby" || sendMrxPosRounds.includes(roundCount)) {
            results.push(player);
        }
    }
    let toSend = {
        "type" : "STATE_UPDATE",
        data : results //Ticket data sent only for debugging reasons, should be stripped to avoid cheating
    };
    notifyEveryone(JSON.stringify(toSend));
}


function getMyData(playerData, id) {
    let msg = {
        "type" : "OWN_DATA_UPDATE",
        data: playerData[id]
    }
    return JSON.stringify(msg);
} 

function onMessage(client, data) {
    
    let roomId = client.roomId;
    let currentRoomData = gameRoomVariables[roomId];
    let id = client.id;
    try {
        var msg = JSON.parse(data);
    }
    catch {
        console.log("Couldn't parse JSON data");
        client.send("Invalid data");
        return;
    }
    if(currentRoomData.gameEnded) {
        client.send(`{"type": "GAME_ENDED", "msg": "Game already ended. End message: ${currentRoomData.endMsg}"}`);
        return;
    }
    if(msg.type == "step") {
        if(!currentRoomData.MrXClaimed) {
            console.log(`Player${id} tried to step before the game started.`);
            client.send(`{"type": "alert", msg: "Game hasn't started because nobody has taken Mr. X role yet."}`);
            return;
        }
        if(playerStepped(client, msg, currentRoomData.playerData, roomId)) {
            client.send(`{"type":"STEP_ACCEPTED"}`);
            currentRoomData.stepCount += 1;
            console.log(`Current state:\n${JSON.stringify(currentRoomData.playerData)}`);
            if(currentRoomData.stepCount>=currentRoomData.allPlayers) {
                currentRoomData.stepCount = 0;
                currentRoomData.roundCount = currentRoomData.roundCount + 1;
                if(endCheck(currentRoomData.playerData, currentRoomData.roundCount, roomId, true)) {
                    console.log("Game finished");
                    notifyEveryone(`{"type": "GAME_ENDED", "msg": "${currentRoomData.endMsg}"}`);
                }
                else {
                    console.log("Game goes on");
                    notifyEveryone(`{"type": "NEXT_ROUND"}`); //New visible game data should be also sent
                    notifyEveryone(`{"type": "MR_X_LAST_TICKET", "ticket": "${currentRoomData.lastMrXTicket}"}`);
                    broadcastVisibleState(currentRoomData.roundCount, currentRoomData.playerData);
                    resetStepCount(roomId);
                }
            }
            else if(endCheck(currentRoomData.playerData, currentRoomData.roundCount, roomId, false)) {
                console.log("Game finished mid round");
                notifyEveryone(`{"type": "GAME_ENDED", "msg": "${currentRoomData.endMsg}"}`);
            }
        }
        else {
            client.send(`{"type":"STEP_NOT_ACCEPTED", "msg": "You can't do that now."}`);
        }
    }
    else if(msg.type == "CLAIM_MR_X") {
        if(!currentRoomData.MrXClaimed) {
            let player = currentRoomData.playerData[id];
            player.role = "X";
            player.tickets = {"taxi": 3, "bus": 3, "metro": 2, "boat": 2, "double": 2},
            player.color = 'white';
            client.send(`{"type": "YOU_ARE_MR_X"}`);
            notifyEveryone(`{"type": "GAME_START"}`);
            broadcastVisibleState(3, currentRoomData.playerData);
            currentRoomData.MrXClaimed = true;
        }
        else {
            client.send(`{"type": "alert", "msg": "Mr X. already taken."}`);
        }
    }
    else if(msg.type == "GET_OWN_DATA") {
        client.send(getMyData(currentRoomData.playerData, id));
    }
    else {
        console.log(`Not implemented JSON message : ${msg.toString()}`);
        client.send(`{"type": "alert", "msg" : "Dude wtf"}`);
    }
}

function resetStepCount(roomID) {
    for (playerId in Object.keys(gameRoomVariables[roomID].playerData)) {
        gameRoomVariables[roomID].playerData[playerId].stepped = 0;
    }
    gameRoomVariables[roomID].lastMrXTicket = "empty";
}

function isAllowedStep(fromPos, toPos, byVehicle) {
    switch(byVehicle) {
        case 'bus':
            //return busMatrix[fromPos][toPos];
            return busRoutes[fromPos].includes(toPos);
            break;
        case 'taxi':
            //return taxiMatrix[fromPos][toPos];
            return taxiRoutes[fromPos].includes(toPos);
            break;
        case 'metro':
            //return metroMatrix[fromPos][toPos];
            return metroRoutes[fromPos].includes(toPos);
            break;
        case 'boat':
            //return boatMatrix[fromPos][toPos];
            return boatRoutes[fromPos].includes(toPos);
            break;
        default:
            console.log("Unknown type:" + byVehicle);
            return false;
    }
    //return true;
}
/*
stepMessage : {"type": "step", "toPos":3, "byVehicle": "taxi"}
*/
function playerStepped(client, msg, playerData, roomId) {
    let id = client.id;
    let player = playerData[id];
    if(player.role!=="X" && !mrXStepped(playerData)) {
        console.log("Mr. X must step first!");
        return false;
    }
    if(isAllowedStep(player.position, msg.toPos, msg.byVehicle) && player.tickets[msg.byVehicle] > 0 && player.stepped == 0) {
        player.position = msg.toPos;
        player.stepped = 1;
        player.tickets[msg.byVehicle] = player.tickets[msg.byVehicle] - 1;
        if(player.role==="X") {
            gameRoomVariables[roomId].lastMrXTicket = msg.byVehicle;
        }
        else {
            const MrXId = getMrXId(playerData);
            gameRoomVariables[roomId].playerData[MrXId].tickets[msg.byVehicle] += 1;
        }
        return true;
    }
    else {
        return false;
    }
}

function getUnusedColor(roomId) {
    let currentRoomData = gameRoomVariables[roomId];
    const colorNum = currentRoomData.freeColors.length;
    const randomIndex = Math.floor(Math.random() * colorNum);
    let color = currentRoomData.freeColors[randomIndex];
    currentRoomData.freeColors = currentRoomData.freeColors.filter(c => c !== color);
    return color;
}

function getRandomEmptyPos(roomId) {
    let currentRoomData = gameRoomVariables[roomId];
    const posNum = currentRoomData.startingPositions.length;
    const randomIndex = Math.floor(Math.random() * posNum);
    let pos = currentRoomData.startingPositions[randomIndex];
    currentRoomData.startingPositions = currentRoomData.startingPositions.filter(p => p !== pos);
    //console.log(pos+"\n"+currentRoomData.startingPositions+"\n"+graphPoints);
    return pos;
}



//Websocket function that manages connection with clients
wss.on('connection', function connection(client, req) {
    //console.log(`URL: ${req.url}`);  //That could be a way to send game room id in connection time
    let roomId;
    try {
        const queryObject = url.parse(req.url, true).query;
        if(queryObject['roomid']===undefined) {
            throw 'Missing room ID';
        }
        roomId = queryObject['roomid'];
    }
    catch {
        client.send("Missing room ID!");
        client.close();
    }
    //roomId = 'tesztszoba'; //should be deleted in the future
    if(gameRoomVariables[roomId]===undefined) {
        console.log(`Room ${roomId} inited.`);
        gameRoomVariables[roomId] = {
            allClients : [],
            stepCount : 0,
            roundCount : 0,
            nextuid : 0,
            playerData : {},
            gameEnded : false,
            endMsg : "",
            MrXClaimed : false,
            allPlayers : 0,
            freeColors : ['blue', 'red', 'yellow', 'green', 'purple', 'orange', 'black'],
            lastMrXTicket : "",
            startingPositions : graphPoints,
        }
    }
    let currentRoomData = gameRoomVariables[roomId];
    //client.id = uuid();
    client.id = currentRoomData.nextuid;
    currentRoomData.nextuid = currentRoomData.nextuid + 1;
    client.roomId = roomId;
    currentRoomData.playerData[client.id] = {
        "id" : client.id, //for debugging, not used in game logic, going to be removed
        "color" : getUnusedColor(roomId),
        "role" : "bobby",
        "position" : getRandomEmptyPos(roomId),
        "stepped" : 0,
        tickets : {"taxi": 9, "bus": 9, "metro": 6, "boat": 0, "double": 0},
    }
    currentRoomData.allPlayers = currentRoomData.allPlayers+1;
    console.log(`Client ${client.id} connected!`)
    console.log(currentRoomData.playerData);
    client.send(`{"type": "log", "msg": "Your id: ${client.id}"}`)
    client.on('message', (data) => {
        onMessage(client, data);
    })

    client.on('close', () => {
        console.log(`${client.id} has closed the connection!`);
        //currentRoomData.playerData = currentRoomData.playerData.filter(p => p.id!==client.id);
    })
});


wss.on('listening', () => {
    console.log(`Websocket listening on port ${serv_port}`);
});
app.listen(site_port); //Webpage listening on port
console.log(`Website is available on port ${site_port}`);