(function() {
    let x = global.__abstract ? __abstract("boolean", "(true)") : true;
    if (x) {
        let obj = { time: Date.now() };
        f = function() { return obj; }
    } else {
        let obj = { time: 99 };
        f = function() { return obj; }
    }
    inspect = function() { return f().time > 0; };
})();
