// recover-from-errors
// expected errors: [{"location":{"start":{"line":10,"column":13},"end":{"line":10,"column":18},"source":"test/error-handler/bad-functions.js"},"severity":"FatalError","errorCode":"PP1003","message":"Property access conflicts with write in additional function global['additional2']"}]
// skip
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
