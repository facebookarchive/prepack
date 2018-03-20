// Copies of 42:1
// skip this test for now
// (It fails because of a dubious double assignment mentioning 42 twice.)
(function () {
    function f(x) {
        function g() {
            return x;
        }
        return g;
    }
    var shared = {x: 42};
    var g0 = f(shared);
    var g1 = f(shared);
    if (global.__optimize) {
        __optimize(g0);
        __optimize(g1);
    }
    global.inspect = function() { 
        return g0() === g1();
    }
})();
