// cannot serialize
// TODO #482: Address limitation when a value is used by more than one generator.
(function() {
    let a = global.__abstract ? __abstract("boolean", "(false)") : false;
    let x = global.__abstract ? __abstract("number", "(42)") : 42;
    let y = x * 2;
    if (a) {
        z = y;
    } else {
        z = y;
    }
    inspect = function() { return z.toString(); }
})();