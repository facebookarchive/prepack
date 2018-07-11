(function() {
  function fn(arg) {
    if (arg.foo()) {
      var arr = [0];
      for (var k = 0; k < arr.length; ++k) {
        break;
      }
    }
    throw new Error("no");
  }

  if (global.__optimize) __optimize(fn);

  global.inspect = function() {
    try {
      fn({ foo() {} });
    } catch (err) {
      return err.message;
    }
    return "expected an error";
  };
})();
