var uuid = require('uuid-random');
const WebSocket = require('ws');
const url = require('url');
//=====WEBSOCKET FUNCTIONS======
const serv_port = 8080;
const wss = new WebSocket.WebSocketServer({port:serv_port}, ()=> {
    console.log('Server started')
})

/* 
    Random global variable list
*/
gameRoomVariables = {}

gameRoomVariables['tesztszoba'] = {
    allClients : [],
    stepCount : 0,
    roundCount : 0,
    nextuid : 0,
    playerData : {},
    endMsg : "",
    MrXClaimed : false,
    allPlayers : 0,
}

//<!-- MAP DATA, this should be independent from game room as these are constants
//The adjacency matrixes are not in use at the moment
const graphPoints = [0,1,2,3];
const graphPointPositions = [(0,0), (100,100), (150, 150), (200, 200)]; //pixel data for every graph point, not neccessary to be on the server side
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

/*Test data points */
/* Msg to claim Mr. X role: {"type" : "CLAIM_MR_X"} */
gameRoomVariables['tesztszoba'].playerData[0] = {
    "name": "Szabi",
    "role" : "bobby",
    "position" : 2,
    "stepped" : 0,
    tickets : {"taxi": 1, "bus": 2, "metro": 3},
    "color" : "blue"
}
gameRoomVariables['tesztszoba'].playerData[1] = {
    "name": "Marci",
    "role" : "bobby",
    "position" : 1,
    "stepped" : 0,
    "double_steps" : 1,
    tickets : {"taxi": 3, "bus": 5, "metro": 3, "boat": 1},
    "color" : "red"
}
gameRoomVariables['tesztszoba'].playerData[2] = {
    "name": "Hassan",
    "role" : "bobby",
    "position" : 0,
    "stepped" : 0,
    tickets : {"taxi": 10, "bus" : 21, "metro": 0},
    "color" : "charga"
}
gameRoomVariables['tesztszoba'].allPlayers = 3;
//console.log(typeof(gameRoomVariables['tesztszoba'].playerData));
/*
Returns if the game has ended, if true, also modifies global variable "endMsg" with the ending message
*/
function endCheck(playerData, roundCount, roomID) {
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
        gameRoomVariables[roomID].endMsg = "Mr. X was caught, game over!";
        return true;
    }
    else if(ticketsNull){
        gameRoomVariables[roomID].endMsg = "Bobbies has run out of tickets, game over!";
        return true;
    }
    else if(roundCount>=24) {
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
        data : results
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
    if(msg.type == "step") {
        if(!currentRoomData.MrXClaimed) {
            console.log(`Player${id} tried to step before the game started.`);
            client.send(`{"type": "alert", msg: "Game hasn't started because nobody has taken Mr. X role yet."}`);
            return;
        }
        if(playerStepped(client, msg, currentRoomData.playerData)) {
            client.send("OK");
            currentRoomData.stepCount += 1;
            console.log(currentRoomData.allPlayers)
            if(currentRoomData.stepCount>=currentRoomData.allPlayers) {
                client.send("End of round");
                currentRoomData.stepCount = 0;
                currentRoomData.roundCount = currentRoomData.roundCount + 1;
                if(endCheck(currentRoomData.playerData, currentRoomData.roundCount, roomId)) {
                    console.log("Game finished");
                    notifyEveryone(`{"type": "GAME_ENDED", "msg": "${currentRoomData.endMsg}"}`);
                }
                else {
                    console.log("Game goes on");
                    notifyEveryone(`{"type": "NEXT_ROUND"}`); //New visible game data should be also sent
                    broadcastVisibleState(currentRoomData.roundCount, currentRoomData.playerData);
                    resetStepCount(roomId);
                }
            }
        }
        else {
            client.send("Not accepted");
        }
    }
    else if(msg.type == "CLAIM_MR_X") {
        if(!currentRoomData.MrXClaimed) {
            currentRoomData.playerData[id].role = "X";
            client.send(`{"type": "YOU_ARE_MR_X"`);
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
        console.log("Step counts reset");
    }
}

function isAllowedStep(fromPos, toPos, byVehicle) {
    switch(byVehicle) {
        case 'bus':
            return busMatrix[fromPos][toPos];
            break;
        case 'taxi':
            return taxiMatrix[fromPos][toPos];
            break;
        case 'metro':
            return metroMatrix[fromPos][toPos];
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
function playerStepped(client, msg, playerData) {
    let id = client.id;
    let player = playerData[id];
    if(isAllowedStep(player.position, msg.toPos, msg.byVehicle) && player.tickets[msg.byVehicle] > 0 && player.stepped == 0) {
        player.position = msg.toPos;
        player.stepped = 1;
        player.tickets[msg.byVehicle] = player.tickets[msg.byVehicle] - 1;
        console.log(playerData);
        return true;
    }
    else {
        return false;
    }
}

//Websocket function that manages connection with clients
wss.on('connection', function connection(client, req) {
    //console.log(`URL: ${req.url}`);  //That could be a way to send game room id in connection time
    let roomId;
    try {
        const queryObject = url.parse(req.url, true).query;
        if(queryObject['roomid']===undefined) {
            throw 'Missing room id';
        }
        roomId = queryObject['roomid'];
    }
    catch {
        client.send("Missing room ID!");
        client.close();
    }
    roomId = 'tesztszoba'; //shpuld be deleted in the future
    let currentRoomData = gameRoomVariables[roomId];
    //Create Unique User ID for player
    //client.id = uuid();
    client.id = currentRoomData.nextuid;
    currentRoomData.nextuid = currentRoomData.nextuid + 1;
    client.roomId = roomId;
    console.log(`Client ${client.id} connected!`)

    client.send(`{"type": "log", "msg": "Your id: ${client.id}"}`)
    client.on('message', (data) => {
        onMessage(client, data);
    })

    client.on('close', () => {
        console.log(`${client.id} has closed the connection!`);
    })
});

wss.on('listening', () => {
    console.log(`listening on ${serv_port}`);
});

