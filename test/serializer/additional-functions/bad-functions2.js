// additional functions

var wildcard = global.__abstract ? global.__abstract("number", "123") : 123;
global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  if (wildcard) throw new Exception();
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
};
