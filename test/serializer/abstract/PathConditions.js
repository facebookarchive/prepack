// does not contain:|| 3 ===
let n1 = global.__abstract ? __abstract("number", "1") : 1;

function f1() {
  if (n1 === 1) return 10;
  if (n1 === 2) throw 20;
  if (n1 === 3) return 30;
  throw 40;
}

try {
  var x = f1();
  if (n1 === 2) console.log(200);
  if (n1 === 1 || n1 === 3) console.log(300);
} catch (e) {
  x = e;
}

inspect = function() {
  return x;
};
