(function() {
  function mkLocation() {
    var x;
    function mkSetter() {
      function setter(y) {
        x = y;
      }
      return setter;
    }
    function mkGetter() {
      function getter() {
        return x;
      }
      return getter;
    }
    if (global.__optimize) __optimize(mkSetter);
    if (global.__optimize) __optimize(mkGetter);
    return { mkSetter, mkGetter };
  }
  if (global.__optimize) __optimize(mkLocation);
  global.inspect = function() {
    let l1 = mkLocation();
    let l2 = mkLocation();
    l1.mkSetter()(42);
    l2.mkSetter()(23);
    return l1.mkGetter()();
  };
})();
