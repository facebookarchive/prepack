// additional functions
// recover-from-errors
// expected errors: [{"location":{"start":{"line":12,"column":29},"end":{"line":12,"column":30},"identifierName":"a","source":"test/error-handler/write-reflect-conflict.js"},"severity":"FatalError","errorCode":"PP1003"}]

a = {};

function additional1() {
  global.a = { f: "foo" };
}

function additional2() {
  global.b = Reflect.ownKeys(a);
}

inspect = function() {
  additional2();
  additional1();
  return global.b;
}
