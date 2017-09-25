// additional functions
// does not contain:x = 5;
// does not contain:y = 10;

global.a = "";
global.b = "";
var z = 42;

function additional1() {
  var x = 5;
}

function additional2() {
  global.b = z + "bar";
  var y = 10;
}

inspect = function() {
  additional2();
  additional1();
  return global.a + global.b;
}
