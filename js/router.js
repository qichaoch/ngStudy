var module = angular.module('main', ["ngRoute"]);

module.config(["$routeProvider", function($routeProvider){
  $routeProvider
      .when('/', {
      template: 'hello world'
  });
}]);
// module.controller('routerController', function ($scope) {

// });