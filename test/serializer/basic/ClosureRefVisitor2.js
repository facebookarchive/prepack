// omit invariants
(function() {
  var f = function() {
    return function() {
      return function() {
        return this.x;
      }.bind({ x: 42 });
    };
  };
  var g1 = f();
  var g2 = f();
  var g3 = f();
  inspect = function() {
    return g1() + g2() + g3();
  };
})();
