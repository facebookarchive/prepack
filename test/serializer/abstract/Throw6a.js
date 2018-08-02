let a = global.__abstract ? __abstract("boolean", "false") : false;
let b = global.__abstract ? __abstract("boolean", "(false)") : false;

function foo() {
  if (a) throw new Error("one");
  if (b) throw new Error("true");
  return "!a && !b";
}

var z = foo();

inspect = function() {
  return z;
};
