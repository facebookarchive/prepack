// does not contain:__scope
// simple closures
(function () {
    let x = 0;
    let f = function() {
        return x++;
    }
    inspect = function() { return f() + f(); };
})();
