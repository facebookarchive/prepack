// does not contain:x = 5;
// does not contain:y = 10;

global.a = "";
global.b = "";
var z = global.__abstract ? __abstract("number", "(42)") : 42;

function additional1() {
  global.a = z + "foo";
  var x = 5;
}

function additional2() {
  global.b = z + "bar";
  var y = 10;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.a + global.b;
};
