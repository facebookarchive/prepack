// does not contain:__scope
// simple closures
(function() {
    var obj = { x: 42 };
    let f = function() { let ret = obj; obj = undefined; return ret; };
    inspect = function() { return f().x + (f() === undefined); }
})();
