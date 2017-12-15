// additional functions
// simple closures
function additional1() {
    var obj = {x: 42};
    return function() { let ret = obj; obj = {}; return ret; }
}
function additional2() {}
inspect = function() { return additional1()().x; }