// additional functions
// throws introspection error

global.a = "";

function additional1() {
  delete global.a;
}

function additional2() {
  global.a = "bar";
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
}
