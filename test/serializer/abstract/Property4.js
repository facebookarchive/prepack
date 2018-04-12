// does not contain:Date
let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob = { };
if (x) {
    ob.x = 123;
} else {
    ob.x = Date.now();
}
if (x) {
    y = ob;
}

inspect = function() { return y; }
