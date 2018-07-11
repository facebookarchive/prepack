let x = global.__abstract ? __abstract("boolean", "true") : true;
let xx = global.__abstract ? __abstract("boolean", "false") : false;
let y = 1;
let yy = 2;
let ob = { a: 1, b: 2 };
var a = 10;
if (x) {
  y = 2;
  ob.a = 10;
  if (xx) {
    y = 3;
    a = 30;
    let b = 40;
    ob.a = 20;
    ob.b = 30;
  } else {
    y = 4;
    a = 40;
    ob.a = 30;
    ob.b = 40;
  }
} else {
  y = 3;
  yy = 6;
  a = 30;
  ob.b = 40;
}
var z = y;
var z1 = yy;
var z2 = ob.a;
var z3 = ob.b;
inspect = function() {
  return "" + a + z + z1 + z2 + z3;
};
