// does not contain:1 + 2
// skip this test for now
// (It fails because 1 + 2 not (yet) getting optimized, as nested calls to __optimize seem to just get ignored?)
(function () {
    function f() {
        function g() {
            return 1 + 2;
        }
        if (global.__optimize) __optimize(g); // This call seems to be just getting ignored?
        return g;
    }
    if (global.__optimize) __optimize(f);
    global.inspect = function() { return f()(); }
})();
