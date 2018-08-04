angular.module('docsTransclusionExample', [])
.controller('Controller', ['$scope', function($scope) {
  $scope.name = 'Tobias';
}])
.directive('myDialog', function() {
  return {
    restrict: 'E',
    transclude: true,
    scope: {},
    templateUrl: 'directive_my-dialog.html',
    link: function(scope) {
      scope.name = 'Jeff';
    }
  };
});