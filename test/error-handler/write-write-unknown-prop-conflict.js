// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"location":{"start":{"line":12,"column":16},"end":{"line":12,"column":21},"source":"test/error-handler/write-write-unknown-prop-conflict.js"},"severity":"RecoverableError","errorCode":"PP1003"},{"location":{"start":{"line":8,"column":16},"end":{"line":8,"column":21},"source":"test/error-handler/write-write-unknown-prop-conflict.js"},"severity":"RecoverableError","errorCode":"PP1003"}]

let i = global.__abstract ? __abstract("string", "x") : "x";
global.a = { x: "" };

function additional1() {
  global.a[i] = "foo";
}

function additional2() {
  global.a[i] = "bar";
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.a.x;
};
