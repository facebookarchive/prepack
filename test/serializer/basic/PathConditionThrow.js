let b = global.__abstract ? __abstract("boolean", "true") : true;
let n1;
if (b) n1 = 5;
let n2 = global.__abstract ? __abstract("number", "7") : 7;

function f() {
  let yy = g();
  return n2 - yy;
}

function g() {
  if (!b) throw 10;
  return n2 - n1;
}

inspect = function() {
  return f();
};
