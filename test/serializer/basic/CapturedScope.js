// serialized function clone count: 0
function f (x) {
  var valueA = 0;
  var valueB = 1;
  var valueC = 2;

  function a() { // no inline
    valueA++;
    return b();
  }

  function b() { // no inline
    valueA++;
    valueB++;
    return c();
  }

  function c() {
    x ? valueC++ : valueC += 2;
    return valueA * valueB * valueC;
  }

  return a;
}

var s = f(true);
var r = f(false);

inspect = function() {
  return s() + ' ' + r();
}
