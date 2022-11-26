const mysql = require("mysql");
const con_data = require("./conData"); //Set you SQL server data in conData.js
let connection  = mysql.createPool(con_data);

module.exports = connection;
