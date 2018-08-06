angular.module('cqcApp', ['pascalprecht.translate'])
.controller('MainCtrl', ['$scope','translateFilter', '$timeout',
	function MainCtrl($scope, translateFilter, $timeout) {
	debugMsg("MainCtrl is initialized")
	$scope.name = "name";
	// $scope.name = translateFilter("name");
	// $timeout(function(){
	// 	debugMsg("before: update after 2s ", $scope.name);
	// 	$scope.name = translateFilter("name");
	// 	debugMsg("after: update after 2s ", $scope.name);
	// }, 2000);
	$scope.change = function(){
		$scope.name = "test";
	}
}])
.directive("cqcText", function(){
	console.log("cqcText  directive register");
	console.log("cqcText  directive register");
    return {
        restrict: 'A',
        // scope: {
        //     option: '='
        // },
        link: function ($scope, element, attrs) {
        	console.log("cqcText  directive run");
            element.text("abc");
        }
    };
})
.filter("cqc", function(){
	console.log("cqc filter code register");
	console.log("cqc filter code register");
	return function(text){
		console.log("cqc filter code run");
		return "cqc_" + text;
	}
})
.service("MainCtrlTestingService", function(){
	console.log("MainCtrlTestingService code run");
	console.log("MainCtrlTestingService code run");
})
.run(function(){
	console.log("cqcApp run method run");
	console.log("MainCtrlTestingService code run");
})
.config(['$translateProvider',function($translateProvider){
	debugMsg("cqcApp module config is called")
	$translateProvider.useStaticFilesLoader({
		prefix: '/i18n/',
		suffix: '.json'
	});
	$translateProvider.preferredLanguage('zh_CN');
	$translateProvider.useLocalStorage();
}]);