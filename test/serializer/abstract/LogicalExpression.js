let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = global.__abstract ? __abstract("boolean", "true !== true") : false;
var z = x && y;
var z0 = y || x;

let ob = global.__abstract ? __abstract("object", "({})") : {};
var z1 = ob && 3;
var z2 = ob && y;
var z3 = false || ob || y;

let a = 111;
let b = y || (a = 123);
var z4 = a;

var z5 = 444;
let c = x && (z5 = 456);

var z6 = 444;
let d = y && (z6 = 456);

var z7 = 777;
let e = x || (z7 = 789);

var z8 = 777;
let f = y || (z8 = 789);

let g = true || (z8 = 111);

inspect = function() {
  return "" + z + z0 + z1 + z2 + z3 + z4 + z5 + z6 + z7 + z8;
};
