// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"location":{"start":{"line":9,"column":16},"end":{"line":9,"column":22},"identifierName":"global","source":"test/error-handler/write-forin-conflict.js"},"severity":"RecoverableError","errorCode":"PP1003"}]

function additional1() {
  global.a = { f: "foo" };
}

function additional2() {
  for (let p in global.a) {
  }
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.b;
};
