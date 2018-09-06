(function() {
  function f() {
    return 23;
  }
  function g() {
    return 42;
  }
  if (global.__abstract) {
    global.__replaceFunctionImplementation_unsafe(f, g);
    global.inspect = f;
  } else {
    global.inspect = g;
  }
})();
