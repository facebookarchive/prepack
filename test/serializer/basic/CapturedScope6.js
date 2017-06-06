// Tests multiple captured scopes in generated function
// serialized function clone count: 0
function f (x) {
  var valueA = 1;

  function a() { // Prevent Inline foo bar
    return valueA++;
  }

  function c() {
    var valueC = 10;

    return function () {
      valueC++;
      return valueA * valueC;
    }
  }

  return [a, c()];
}

var s = f();
var r = f();

inspect = function() {
  return s[0]() + ' ' + s[1]() + " " + s[1]() + " " + r[1]();
}
