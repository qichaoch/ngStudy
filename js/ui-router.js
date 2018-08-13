var module = angular.module('main', ["ui.router"]);

module.config([
	"$stateProvider"
	, "$urlRouterProvider"
	,function(
		$stateProvider
		,$urlRouterProvider
		){
      $stateProvider
      .state('home', {
      	url:'/',
      	// template:"this is home template"
      	views:{
      		'':{
      			'template':"default template"
      		},
      		'status':{
      			template:"status template"
      		}
      	}
      });
      $urlRouterProvider.otherwise('/');
}]);
// module.controller('routerController', function ($scope) {

// });