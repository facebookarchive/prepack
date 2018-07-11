// Copies of arguments:1
(function() {
  var f = function(x) {
    var y = arguments[0];
    return function() {
      /* This function is way too big to be inlined. */
      return function(z) {
        return y + arguments[0];
      };
    };
  };
  var g1 = f(1);
  var g2 = f(2);
  var g3 = f(3);
  inspect = function() {
    return g1()(4) + g2()(5) + g3()(6);
  };
})();
