// serialized function clone count: 0
function f (x) {
  var valueA = 0;
  var valueB = 1;
  var valueC = 0;

  function a() { // Prevent Inline foo bar
    valueA++;
    valueC++;
    return b();
  }

  function b() { // Prevent Inline foo bar
    valueB++;
    valueA++;
    valueC++;
    return valueB * valueA * valueC;
  }

  return [a, b];
}

var s = f();
var r = f();

inspect = function() {
  return s[0]() + ' ' + r[1]();
}
