var __evaluatePureFunction =
  global.__evaluatePureFunction ||
  function(f) {
    return f();
  };

__evaluatePureFunction(
  function() {
    var x = __evaluatePureFunction(function() {
      return {};
    });

    x.foo = 123;
  },
  function() {
    throw new Error("Side-effect detected");
  }
);

inspect = function() {
  // we only care that the init doesn't throw an error
  return null;
};
