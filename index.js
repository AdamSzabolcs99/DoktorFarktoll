var uuid = require('uuid-random');
const WebSocket = require('ws');

//=====WEBSOCKET FUNCTIONS======
const serv_port = 8080;
const wss = new WebSocket.WebSocketServer({port:serv_port}, ()=> {
    console.log('Server started')
})
let playerData = {};


const graphPoints = [0,1,2,3];
const graphPointPositions = [(0,0), (100,100), (150, 150), (200, 200)]; //pixel data for every graph point

let endMsg = "";
//The adjacency matrixes are not in use at the moment
const taxiMatrix = [
    [true, true, true, false],
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
  ];
const metroMatrix = [
    [false, false, true, false],
    [false, false, true, true],
    [true, true, false, false],
    [false, false, true, false],
  ];
const busMatrix = [
    [false, true, true, false],
    [false, false, true, true],
    [false, false, false, false],
    [false, false, true, false],
  ];


/*Test data points */

let allPlayers = 3;
playerData[0] = {
    "name": "Szabi",
    "role" : "bobby",
    "position" : 2,
    "stepped" : 0,
    tickets : {"taxi": 1, "bus": 2, "metro": 3}
}
playerData[1] = {
    "name": "Marci",
    "role" : "X",
    "position" : 1,
    "stepped" : 0,
    tickets : {"taxi": 3, "bus": 5, "metro": 3, "boat": 1}
}
playerData[2] = {
    "name": "Hassan",
    "role" : "bobby",
    "position" : 0,
    "stepped" : 0,
    tickets : {"taxi": 10, "bus" : 21, "metro": 0}
}

/*
Returns if the game has ended, if true, also modifies global variable "endMsg" with the ending message
*/
function endCheck(playerData) {
    bobbyPositions = [];
    MrXPosition = -1;
    let ticketsNull = true;
    for (playerId in Object.keys(playerData)) {
        player = playerData[playerId];
        tickets = player.tickets;
        if(player.role=="bobby") {
            bobbyPositions.push(player.position);
            if(tickets.taxi > 0 || tickets.bus > 0 || tickets.metro > 0) {
                ticketsNull = false;
            }
        }
        else if(player.role=="X") {
            MrXPosition = player.position;
        }
    }
    if(bobbyPositions.includes(MrXPosition)) {
        endMsg = "Mr. X was caught, game over!";
        return true;
    }
    else if(ticketsNull){
        endMsg = "Bobbies has run of tickets, game over!";
        return true;
    }
    else if(roundCount>=24) {
        endMsg = "End of the game, Mr. X wasn't caught!";
        return true;
    }
    return false;
}



let allClients = [];
let stepCount = 0;
let roundCount = 0;

let nextuid = 0;

function notifyEveryone(msg) {
    wss.clients.forEach(function(client) {
        client.send(msg.toString());
     });
}

function onMessage(client, data) {
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
        if(playerStepped(client, msg)) {
            client.send("OK");
            stepCount += 1;
            if(stepCount>=allPlayers) {
                client.send("End of round");
                stepCount = 0;
                roundCount = roundCount + 1;
                if(endCheck(playerData)) {
                    console.log("Game finished");
                    notifyEveryone(`{"type": "end", "msg": "${endMsg}"}`);
                }
                else {
                    console.log("Game goes on");
                    notifyEveryone(`{"msg": "NEXT_ROUND"}`);
                    resetStepCount();
                }
            }
        }
        else {
            client.send("Not accepted");
        }
    }
    else {
        console.log(msg.toString());
    }
    //console.log(`${client.id}: ${msg}`);
}

function resetStepCount() {
    for (playerId in Object.keys(playerData)) {
        playerData[playerId].stepped = 0;
        console.log("Step counts reseted");
    }
}

function isAllowedStep(fromPos, toPos, byVehicle) {
    return true;
}

/*
stepMessage : {"type": "step", "toPos":3, "byVehicle": "taxi"}
*/
function playerStepped(client, msg) {
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

//Websocket function that managages connection with clients
wss.on('connection', function connection(client){
    allClients.push(client);
    //Create Unique User ID for player
    //client.id = uuid();
    client.id = nextuid;
    nextuid = nextuid + 1;
    console.log(`Client ${client.id} Connected!`)

    //Send default client data back to client for reference
    client.send(`{"id": "${client.id}"}`)
    //Method retrieves message from client
    client.on('message', (data) => {
        onMessage(client, data);
    })
    
    //Method notifies when client disconnects
    client.on('close', () => {
        console.log(`${client.id} has closed the connection!`);
    })

})

wss.on('listening', () => {
    console.log(`listening on ${serv_port}`);
})

