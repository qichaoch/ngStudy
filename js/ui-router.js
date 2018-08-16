var module = angular.module('main', ["ui.router"]);

module.config([
	"$stateProvider"
	, "$urlRouterProvider"
	,function(
		$stateProvider
		,$urlRouterProvider
		){
      // $stateProvider
      // .state('home', {
      // 	url:'/',
      // 	// template:"this is home template"
      // 	views:{
      // 		'':{
      // 			'template':"default template"
      // 		},
      // 		'status':{
      // 			template:"status template"
      // 		}
      // 	}
      // });

        // //embedded router testing
        // $stateProvider
        //     .state('parent', {
        //         abstract: true,
        //         url: '/',
        //         template: 'I am parent <div ui-view></div><div ui-view></div><div ui-view></div>'
        //     })
        //     .state('parent.child', {
        //         url: '',
        //         template: 'I am child'
        //     });

        $stateProvider
            .state('parent', {
                abstract: true,
                url: '/',
                template: 'I am parent <div ui-view></div><div ui-view></div><div ui-view></div>'
            })
            .state('child', {
            	parent:"parent",
                url: '',
                template: 'I am child'
            });

      $urlRouterProvider.otherwise('/');
}]);
// module.controller('routerController', function ($scope) {

// });