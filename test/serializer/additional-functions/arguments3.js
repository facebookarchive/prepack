// does not contain:x = 5;

function additional1(argument, argument) {
  var z = { foo: argument };
  var x = 5;
  return z;
}
if (global.__optimize) __optimize(additional1);

inspect = function inspect() {
  let z = additional1(7, 10);

  return "" + JSON.stringify(z);
};
