// skip this test for now
// (It fails with an invariant violation that should probably be a user-facing error.)

(function () {
    function f() {
        var shared = 0;
        function g0() {
            shared += 1;
        }
        function g1() {
            shared += 2; // We should fail nicely
        }
        return [g0, g1];
    }
    var a = f();
    var g0 = a[0];
    var g1 = a[1];
    if (global.__optimize) {
        __optimize(g0);
        __optimize(g1);
    }
    global.inspect = function() { 
        return g0() + g1();
    }
})();
