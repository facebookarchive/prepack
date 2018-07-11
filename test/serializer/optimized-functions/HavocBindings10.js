// This test is there to check for a regression where code was generated
// that used a variable before it was declared, which trips the linter.
// The issue arose when joining a binding from a declarative environment record that only existed in one branch of the joined executions.
(function() {
  function makeClosure(bar) {
    if (bar) return null;
    var captured = bar;
    return function closure() {
      return captured;
    };
  }

  function fn(arg) {
    if (arg) return undefined;
    var state = {};
    state.closure = makeClosure(arg.bar);
    arg.baz(state);
  }

  global.fn = fn;

  if (global.__optimize) {
    __optimize(fn);
  }

  inspect = function() {
    return fn(true);
  };
})();
