// additional functions

global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  global.a = "foo";
}

inspect = function() {
  additional2();
  additional1();
  return global.a + global.b;
}
