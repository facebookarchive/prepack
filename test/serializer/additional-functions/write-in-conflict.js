// additional functions
// throws introspection error

function additional1() {
  a = "foo";
}

function additional2() {
  return "a" in global;
}

global.__residual ? __residual("void", additional1) : additional1();
x = additional2();

inspect = function() {
  return x;
}
