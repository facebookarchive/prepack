// Copies of [1, 2, 3]:1
// Copies of [4, 5, 6]:1
// Copies of case:5
(function() {
  var f1 = function() {
    var x = 1,
      y = 2,
      z = 3;
    return function() {
      return x++ + y++ + z++;
    };
  };
  var f2 = function() {
    var x = 4,
      y = 5,
      z = 6;
    return function() {
      return x++ + y++ + z++;
    };
  };

  global.g1 = f1();
  global.g2 = f2();
  global.g3 = f1();
  global.g4 = f2();
  global.g5 = f1();
  inspect = function() {
    return global.g1() + global.g2() + global.g3() + global.g4();
  };
})();
