var express = require('express');
var app = express();
var server = require('http').createServer(app);
//static file position
app.use('/', express.static(__dirname + '/static')); 
app.use('/lib', express.static(__dirname + '/lib'));
app.use('/js', express.static(__dirname + '/js'));
app.use('/imgs', express.static(__dirname + '/imgs'));
app.use('/i18n', express.static(__dirname + '/i18n'));
app.use('/bc', express.static(__dirname + '/bower_components'));
var port = 8080;
console.log("launch nodejs server at port: " + port);
//listening port
server.listen(port);