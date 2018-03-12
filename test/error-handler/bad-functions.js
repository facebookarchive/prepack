// recover-from-errors
// expected errors: [{"location":{"start":{"line":9,"column":13},"end":{"line":9,"column":18},"source":"test/error-handler/bad-functions.js"}}]
var wildcard = global.__abstract ? global.__abstract("number", "123") : 123;
global.a = "";

function additional1() {
  if (wildcard) throw new Exception();
  global.a = "foo";
}

function additional2() {
  global.a = "foo";
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
}
