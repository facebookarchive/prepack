// does contain:42
(function () {
    function f(g) {
        let obj = {x: 23};
        global.__makeFinal ? __makeFinal(obj) : Object.freeze(obj);
        function f() { return obj; }
        g(f);
        return obj.x + 19;
    }
    global.__optimize && __optimize(f);
    global.inspect = function() { return f(g => g()); }
})();