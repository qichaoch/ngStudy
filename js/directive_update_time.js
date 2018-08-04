angular.module('docsIsolateScopeDirective', [])
.controller('Controller', ['$scope', function($scope) {
  $scope.format = "M/d/yy h:mm:ss a";
}])
.directive('myCurrentTime', ["dateFilter", "$interval", 
  function(dateFilter, $interval) {
  var link = function(scope, element, attrs){
    var format, timerId;
    var fieldName = attrs.myCurrentTime;
    var updateText = function(){
      // format = scope[fieldName];
      console.log(format);
      element.text(dateFilter(new Date(), format));
    }
    ////we can get immediately notifiaction when the value is changed
    scope.$watch(fieldName, function(value){
      format = value;
      updateText();
    })
    $interval(updateText, 1000);
  };
  return {
    scope:{
      a:"=a"
    },
    link:link
  };
}]);