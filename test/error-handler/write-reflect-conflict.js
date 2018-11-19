// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"location":{"start":{"line":11,"column":29},"end":{"line":11,"column":30},"identifierName":"a","source":"test/error-handler/write-reflect-conflict.js"},"severity":"RecoverableError","errorCode":"PP1003"}]

a = {};

function additional1() {
  global.a = { f: "foo" };
}

function additional2() {
  global.b = Reflect.ownKeys(a);
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
