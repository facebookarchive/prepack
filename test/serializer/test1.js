(function () {
  let top = 5;
  function af1() {
    let mutable = 3;
    return function() {
      --top;
      return ++mutable;
    }
  }
  global.f = af1;
  global.g = af1();
  if (global.__registerAdditionalFunctionToPrepack)
    global.__registerAdditionalFunctionToPrepack(af1);
  inspect = function() {
    return g();
  }
})();
