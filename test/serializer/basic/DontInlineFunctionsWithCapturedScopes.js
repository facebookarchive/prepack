// Copies of \+\+:1
(function() {
  var f = function() {
    var mutable = 10;
    return function() {
      ++mutable;
    };
  };

  global.g1 = f();
  global.g2 = f();
  global.g3 = f();
  global.g4 = f();

  inspect = function() {
    return global.g1() + global.g2() + global.g3() + global.g4();
  };
})();
