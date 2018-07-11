// throws introspection error

function additional1() {
  a = "foo";
}

function additional2() {
  return "a" in global;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

global.__residual ? __residual("void", additional1) : additional1();
x = additional2();

inspect = function() {
  return x;
};
