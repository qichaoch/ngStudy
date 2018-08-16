var module = angular.module('main', ["ngRoute"]);

module.config(["$routeProvider", function($routeProvider){
  $routeProvider
      .when('/', {
      template: 'hello world'
  });
  //   $routeProvider
  //       .when('/', {
  //           template: 'I am parent <div ng-view>I am child</div>'
  //       });
}]);
// module.controller('routerController', function ($scope) {

// });