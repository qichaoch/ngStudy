/*
* created by chenqichao 2018/7/27 0027
*/
(function(){
    debugMsg && debugMsg("cqc localStorage is called");
    var a = function(){
        var app = angular.module("pascalprecht.translate");
        app.factory("$translateLocalStorage", translateLocalStorageFactory);
        translateLocalStorageFactory.$injects = ["$window"];
        function translateLocalStorageFactory($window){
            debugMsg && debugMsg("cqc translateLocalStorageFactory is called");
            var obj = {};
            var languageKey;
            obj.get = function(key){
                debugMsg && debugMsg("cqc localStorage.get is called " + key);
                if(!languageKey){
                    languageKey = $window.localStorage.getItem(key);
                }
                return languageKey;
            };
            obj.put = function(key, value){
                debugMsg && debugMsg("cqc localStorage.put is called " + key);
                this.set(key, value)
            };
            obj.set = function(key, value){
                debugMsg && debugMsg("cqc localStorage.set is called " + key);
                languageKey = value;
                $window.localStorage.setItem(key, value);
            };
            return obj;
        }
        translateLocalStorageFactory.displayName = "$translateLocalStorage";
    };
    a();
})();
