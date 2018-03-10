// recover-from-errors
// expected errors: [{"location":{"start":{"line":12,"column":26},"end":{"line":12,"column":35},"identifierName":"Exception","source":"test/error-handler/bad-functions2.js"},"severity":"FatalError","errorCode":"PP1002","message":"Additional function (unknown function) may terminate abruptly"}]

var wildcard = global.__abstract ? global.__abstract("number", "123") : 123;
global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  if (wildcard) throw new Exception();
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
