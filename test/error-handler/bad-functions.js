// recover-from-errors
// expected errors: [{location: {"start":{"line":7,"column":26},"end":{"line":7,"column":35},"identifierName":"Exception","source":"test/error-handler/bad-functions.js"}},{"location":{"start":{"line":12,"column":13},"end":{"line":12,"column":18},"source":"test/error-handler/bad-functions.js"},"severity":"FatalError","errorCode":"PP1003"}, {location: {"start":{"line":8,"column":13},"end":{"line":8,"column":18},"source":"test/error-handler/bad-functions.js"}}]
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
