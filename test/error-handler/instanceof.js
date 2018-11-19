// recover-from-errors
// expected errors: [{"location":{"start":{"line":15,"column":20},"end":{"line":15,"column":23},"identifierName":"foo","source":"test/error-handler/instanceof.js"},"severity":"RecoverableError","errorCode":"PP0004"}, {"location":{"start":{"line":21,"column":20},"end":{"line":21,"column":21},"identifierName":"b","source":"test/error-handler/instanceof.js"},"severity":"RecoverableError","errorCode":"PP0003"}, {"location":{"start":{"line":27,"column":20},"end":{"line":27,"column":21},"identifierName":"f","source":"test/error-handler/instanceof.js"},"severity":"RecoverableError","errorCode":"PP0004"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
function foo() {}
Object.defineProperty(foo, Symbol.hasInstance, {
  value: function() {
    throw 123;
  },
});
var f = global.__abstract ? __abstract("object", "foo") : foo;
var o = global.__abstract ? __abstract("object", "({})") : {};

try {
  x1 = o instanceof foo;
} catch (err) {
  x1 = err;
}

try {
  x2 = o instanceof b;
} catch (err) {
  x2 = err;
}

try {
  x3 = o instanceof f;
} catch (err) {
  x3 = err;
}
