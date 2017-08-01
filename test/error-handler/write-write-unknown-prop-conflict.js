// additional functions
// recover-from-errors
// expected errors: [{"location":{"start":{"line":13,"column":16},"end":{"line":13,"column":21},"source":"test/error-handler/write-write-unknown-prop-conflict.js"},"severity":"FatalError","errorCode":"PP1003"},{"location":{"start":{"line":9,"column":16},"end":{"line":9,"column":21},"source":"test/error-handler/write-write-unknown-prop-conflict.js"},"severity":"FatalError","errorCode":"PP1003"}]

let i = global.__abstract ? __abstract("string", "x") : "x";
global.a = { x: "" }

function additional1() {
  global.a[i] = "foo";
}

function additional2() {
  global.a[i] = "bar";
}

inspect = function() {
  additional2();
  additional1();
  return global.a.x;
}
