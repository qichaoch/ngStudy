var express = require('express');
var app = express();
var server = require('http').createServer(app);
//static file position
app.use('/', express.static(__dirname + '/static')); 
app.use('/lib', express.static(__dirname + '/lib'));
app.use('/js', express.static(__dirname + '/js'));
var port = 8080;
console.log("launch nodejs server at port: " + port);
//listening port
server.listen(port);