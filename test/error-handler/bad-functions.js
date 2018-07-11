// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP0023","callStack":"Error\n    "},{"location":{"start":{"line":12,"column":13},"end":{"line":12,"column":18},"source":"test/error-handler/bad-functions.js"},"severity":"FatalError","errorCode":"PP1003"},{"location":{"start":{"line":8,"column":13},"end":{"line":8,"column":18},"source":"test/error-handler/bad-functions.js"},"severity":"FatalError","errorCode":"PP1003"}]
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
  __optimize(additional1, { pure: false });
  __optimize(additional2, { pure: false });
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
};
