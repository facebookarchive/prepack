// serialized function clone count: 0
function f (x) {
  var valueA = 1;
  var valueB = 2;
  var valueC = 3;

  function a() { // Prevent Inline foo bar
    valueA++;
    valueC++;
    return c();
  }

  function b() { // Prevent Inline foo bar
    valueB++;
    return c();
  }

  function c() {
    valueC++;
    return valueB * valueA * valueC;
  }

  function d() {
    var valueF = 10;

    function g() {
      valueA = valueB * valueF;
      return c();
    }

    return [g];
  }

  return [a, b, c, d];
}

var s = f();
var r = f();

inspect = function() {
  return s[0]() + ' ' + r[1]() + " " + r[2]() + " " + r[3]()[0]();
}
