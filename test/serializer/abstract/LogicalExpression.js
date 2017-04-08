let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = global.__abstract ? __abstract("boolean", "true !== true") : false;
z = x && y;
z0 = y || x;

let ob = global.__abstract ? __abstract("object", "({})") : {};
z1 = ob && 3;
z2 = ob && y;
z3 = ob || y;

let a = 111;
let b = y || (a = 123);
z4 = a;

z5 = 444;
let c = x && (z5 = 456);

z6 = 444;
let d = y && (z6 = 456);

z7 = 777;
let e = x || (z7 = 789);

z8 = 777;
let f = y || (z8 = 789);

inspect = function() { return "" + z + z0 + z1 + z2 + z3 + z4 + z5 + z6 + z7 + z8; }
