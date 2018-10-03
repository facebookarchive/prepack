(function() {
  function mkLocation() {
    var x;
    function setter(y) {
      x = y;
    }
    function getter() {
      return x;
    }
    if (global.__optimize) __optimize(setter);
    return { setter, getter };
  }
  if (global.__optimize) __optimize(mkLocation);
  global.inspect = function() {
    var l = mkLocation();
    l.setter(42);
    return l.getter();
  };
})();
