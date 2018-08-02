// does not contain:x = 5;
// does not contain:y = 10;
// expected Warning: PP1007

global.a = "";
global.b = "";

function additional1() {
  global.a = "foo";
  var x = 5;
}

function additional2() {
  global.b = "bar";
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
