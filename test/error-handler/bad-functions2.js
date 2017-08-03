// additional functions
// recover-from-errors
// expected errors: [{"location":{"start":{"line":13,"column":26},"end":{"line":13,"column":35},"identifierName":"Exception","source":"test/error-handler/bad-functions2.js"},"severity":"FatalError","errorCode":"PP1002","message":"Additional function global['additional2'] may terminate abruptly"}]

var wildcard = global.__abstract ? global.__abstract("number", 123, "123") : 123;
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
}
