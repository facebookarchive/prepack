// instant render
// expected errors: [{"location":{"start":{"line":5,"column":10},"end":{"line":5,"column":12},"source":"test/error-handler/EmptyBuiltInArrayCycle.js"},"severity":"RecoverableError","errorCode":"PP0039"}]

(function() {
  var a = [];
  var c = global.__abstract ? __abstract("boolean", "true") : "c";
  if (c) {
    a[0] = a;
  }
  global.a = a;

  inspect = function() {
    return global.a.foo;
  };
})();
