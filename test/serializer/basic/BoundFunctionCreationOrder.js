(function() {
  function wrap(obj) {
    function A() {
      return obj.hello();
    }
    function B() {
      return obj.world();
    }
    A.B = B;
    return A;
  }

  let fooObj = {};
  let fooFn = wrap(fooObj);
  let barFn = wrap(fooObj);
  fooObj.bar = barFn;

  global.foo = fooFn;

  global.inspect = function() {
    return true;
  };
})();
