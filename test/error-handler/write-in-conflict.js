// additional functions
// recover-from-errors
// expected errors: [{"location":{"start":{"line":10,"column":20},"end":{"line":10,"column":26},"identifierName":"global","source":"test/error-handler/write-in-conflict.js"},"severity":"FatalError","errorCode":"PP1003"}]

function additional1() {
  global.a = "foo";
}

function additional2() {
  global.b = "a" in global;
}

inspect = function() {
  additional2();
  additional1();
  return global.b;
}
