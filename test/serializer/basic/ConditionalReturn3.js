let a = global.__abstract ? __abstract("boolean", "(true)") : true;
let b = global.__abstract ? __abstract("boolean", "((true))") : true;

let na;
if (!a) na = 10;

let nb;
if (!b) nb = 20;

let n2 = global.__abstract ? __abstract("number", "7") : 7;

function f() {
  if (b) return;
  return nb - n2;
}

function g() {
  if (a) return;
  f();
  return na - n2;
}

g();
inspect = function() {
  return true;
};
