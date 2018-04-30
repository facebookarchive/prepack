(function () {
    let outer = {};
    function f(x) {
        outer.x = x;
        return outer;
    }
    if (global.__optimize) __optimize(f);
    global.f = f;
    inspect = function() { return f(42).x; }
})();
