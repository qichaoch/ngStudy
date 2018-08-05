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
.config(['$translateProvider',function($translateProvider){
	debugMsg("cqcApp module config is called")
	$translateProvider.useStaticFilesLoader({
		prefix: '/i18n/',
		suffix: '.json'
	});
	$translateProvider.preferredLanguage('zh_CN');
	$translateProvider.useLocalStorage();
}]);