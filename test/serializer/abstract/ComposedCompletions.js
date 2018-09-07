let n1 = global.__abstract ? __abstract("number", "4") : 4;

function f1() {
  if (n1 === 1) return 10;
  if (n1 === 2) throw 20;
  if (n1 === 3) return 30;
  if (n1 === 4) return 40;
  throw 50;
}

var x = f1();

inspect = function() {
  return x;
};
