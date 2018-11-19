// Copies of arguments:1
(function() {
  var f = function() {
    return function() {
      /* This function is way too big to be inlined. */
      return function(x) {
        return arguments[0];
      };
    };
  };
  var g1 = f();
  var g2 = f();
  var g3 = f();
  inspect = function() {
    return g1()(1) + g2()(2) + g3()(3);
  };
})();
