// does not contain:x = 5;

function additional1(argument) {
  var z = { foo: argument };
  var x = 5;
  return z;
}
if (global.__optimize) __optimize(additional1);

inspect = function inspect() {
  let z = additional1(7);
  let z2 = additional1(10);

  return "" + JSON.stringify(z) + " " + JSON.stringify(z2);
};
