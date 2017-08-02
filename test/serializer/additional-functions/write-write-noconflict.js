// additional functions

global.a = "";
global.b = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  global.b = "bar";
}

inspect = function() {
  additional2();
  additional1();
  return global.a + global.b;
}
