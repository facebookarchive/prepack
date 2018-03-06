// recover-from-errors
// abstract effects
// expected errors: [{"location":{"start":{"line":7,"column":25},"end":{"line":7,"column":28},"source":"test/error-handler/put-value-on-abstract-base.js"},"severity":"FatalError","errorCode":"PP0027"}]

__evaluatePureFunction(() => {
  var somethingUnknown = global.__abstract();
  somethingUnknown.foo = 123;
});
