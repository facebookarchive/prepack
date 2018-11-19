(function() {
  function f() {
    return "__output" in global;
  }
  if (global.__abstract) {
    // we are running under Prepack
    global.__output = { inspect: f };
  } else {
    // we are not running under Prepack
    global.inspect = f;
  }
})();
