// additional functions
// throws introspection error

global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  delete global.a;
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
}
