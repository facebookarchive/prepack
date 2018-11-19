// jsc
// recover-from-errors
// expected errors: [{"location":{"start":{"line":5,"column":22},"end":{"line":5,"column":25},"source":"test/error-handler/Set.js"},"severity":"RecoverableError","errorCode":"PP0001"}]

let s = new Set(["a", "a"]);

inspect = function() {
  return s.size === 1;
};
