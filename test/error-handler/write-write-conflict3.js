// additional functions
// recover-from-errors
// expected errors: [{"location":{"start":{"line":12,"column":9},"end":{"line":12,"column":15},"identifierName":"global","source":"test/error-handler/write-write-conflict3.js"},"severity":"FatalError","errorCode":"PP1003"},{"location":{"start":{"line":8,"column":13},"end":{"line":8,"column":18},"source":"test/error-handler/write-write-conflict3.js"},"severity":"FatalError","errorCode":"PP1003"}]

global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  delete global.a;
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
}
