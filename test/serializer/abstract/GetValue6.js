let ob = global.__makePartial ? __makeSimple(__makePartial({})) : { a: 123 };
if (global.__residual)
  __residual(
    "void",
    o => {
      o.a = 123;
    },
    ob
  );

var z = ob.a;

inspect = function() {
  return z;
};
