// additional functions
// recover-from-errors
// expected errors: [{"location":{"start":{"line":10,"column":16},"end":{"line":10,"column":22},"identifierName":"global","source":"test/error-handler/write-forin-conflict.js"},"severity":"FatalError","errorCode":"PP1003"}]

function additional1() {
  global.a = { f: "foo" };
}

function additional2() {
  for (let p in global.a) {

  }
}

inspect = function() {
  additional2();
  additional1();
  return global.b;
}
