(function() {
    let x = global.__abstract ? __abstract("boolean", "(true)") : true;
    let y = global.__abstract ? __abstract("boolean", "(true)") : true;
    let obj = { p: 42 };
    if (y) {
        if (x) {
            f = function() { return obj; }
        } else {
            g = function() { return obj; }
        }
    }
    inspect = function() { return (f || g)().p };
})();
