(function () {
    function f() {
        var mutable = 0;
        function g() {
            return mutable++; // This should probably not be supported any time soon.
        }
        if (global.__optimize) __optimize(g);
        return g;
    }
    if (global.__optimize) __optimize(f);
    global.inspect = function() { var g = f(); return g() + g() + g(); }
})();
