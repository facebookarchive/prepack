// Copies of \+\+:1
(function () {
    var f = function() {
        var mutable = 10;
        return function() { ++mutable; };
    }
  
    global.g1 = f();
    global.g2 = f();
    global.g3 = f();
    global.g4 = f();

    inspect = function() { return g1() + g2() + g3() + g4(); }
})();
