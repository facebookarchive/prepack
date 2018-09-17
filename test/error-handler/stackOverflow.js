// expected errors: [{"location":{"start":{"line":2,"column":15},"end":{"line":2,"column":16},"identifierName":"f","source":"test/error-handler/stackOverflow.js"},"severity":"FatalError","errorCode":"PP0045"}]
function f() {
  f();
}
f();
