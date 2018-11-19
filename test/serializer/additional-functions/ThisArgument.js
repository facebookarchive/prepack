(function() {
  function f(z) {
    var x = this.x;
    var self = this;
    return function(y) {
      return self.x + y + z;
    };
  }

  if (global.__optimize) __optimize(f);

  global.inspect = function() {
    var g = f.apply({ x: 11 });
    return g(7);
  };
})();
