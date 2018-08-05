var myApp = angular.module('myApp', []);
myApp.value('clientId', 'a12345654321x');
myApp.controller('DemoController', ['clientId', function DemoController(clientId) {
  this.clientId = clientId;
}]);