(function() {
  let f = function() {
    var o = {};
    return function(replace) {
      if (replace) o = {};
      return o;
    };
  };

  let g1 = f();
  let g2 = f();
  let g3 = f();
  let g4 = f();

  inspect = function() {
    return ((("" + g1(false) === g1(false) + g2(false)) !== g2(true) + g3(true)) !== g1(true) + g4(true)) !== g1(true);
  };
})();
