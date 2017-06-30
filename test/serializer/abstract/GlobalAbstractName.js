// does not contain:global
(function() {
    global.x = 42;
    global.y = global.__abstract ? __abstract("number", "global.x") : 42;
    inspect = function() { return y; }
})();