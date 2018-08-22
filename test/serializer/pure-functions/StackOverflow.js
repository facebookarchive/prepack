if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

// This means `Modules.prototype.getRequire` and `Modules.prototype.getDefine` can cache the result of
// `Module.prototype._getGlobalProperty`. Otherwise the execution of `_getGlobalProperty` will blow the Prepack stack in
// tracer code and we won’t observe our bug.
global.require = () => {};
global.__d = () => {};

const result = global.__evaluatePureFunction(() => {
  function loop(i) {
    if (i === 1000) {
      return "Hello, world";
    }
    // Prevent tail recursion optimizations from applying.
    return loop(i + 1) + "!";
  }
  return loop(0);
});

global.inspect = () => result;
