// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    at additional1 (unknown)"},{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    at additional2 (unknown)"},{"location":{"start":{"line":9,"column":20},"end":{"line":9,"column":26},"identifierName":"global","source":"test/error-handler/write-in-conflict.js"},"severity":"FatalError","errorCode":"PP1003"}]

function additional1() {
  global.a = "foo";
}

function additional2() {
  global.b = "a" in global;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.b;
}
