// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"location":{"start":{"line":11,"column":9},"end":{"line":11,"column":15},"identifierName":"global","source":"test/error-handler/write-write-conflict3.js"},"severity":"RecoverableError","errorCode":"PP1003"},{"location":{"start":{"line":7,"column":13},"end":{"line":7,"column":18},"source":"test/error-handler/write-write-conflict3.js"},"severity":"RecoverableError","errorCode":"PP1003"}]

global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  delete global.a;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
};
