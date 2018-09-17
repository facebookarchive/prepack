// expected errors: [{"location":{"start":{"line":3,"column":2},"end":{"line":3,"column":3},"identifierName":"f","source":"test/error-handler/stackOverflow.js"},"severity":"FatalError","errorCode":"PP0045"}]
function f() {
  f();
}
f();
