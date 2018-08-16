describe("A suite", function() {
	describe("basic functions", function() {
	    var name;

	    beforeEach(function(){
	    	console.log("beforeEach " + name);
	    });

	    afterEach(function(){
	    	console.log("afterEach " + name);
	    });

	    it("sayHello", function() {
	        name = "Conan";
	        var exp = "Hello Conan";
	        expect(exp).toEqual(sayHello(name));
	        var name1 = "ABC";
	        var exp1 = "Hello ABC";
	        expect(exp1).toEqual(sayHello(name1));
	    });

	    it("sayHelloAgain", function() {
	        name = "Conan";
	        var exp = "Hello Conan";
	        expect(exp).toEqual(sayHello(name));
	        var name1 = "ABC";
	        var exp1 = "Hello ABC";
	        expect(exp1).toEqual(sayHello(name1));
	    });    
	});
});