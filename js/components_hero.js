angular.module('heroApp', []).controller('MainCtrl', function MainCtrl() {
  this.hero = {
    name: 'Spawn'
  };
});
angular.module('heroApp').component('heroDetail', {
  templateUrl: 'components_hero_detail.html',
  bindings: {
    hero: '='
  }
});