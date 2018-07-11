// expected errors: [{"location":{"start":{"line":7,"column":12},"end":{"line":7,"column":14},"source":"test/error-handler/FinalObjectCannotBeMutated.js"},"severity":"FatalError","errorCode":"PP0026","callStack":"Error\n    "}]
(function() {
  function f() {
    let o = {};
    o.foo = 23;
    __makeFinal(o);
    o.foo = 42; // <-- error expected here
  }
  __optimize(f);
  global.inspect = f;
})();
