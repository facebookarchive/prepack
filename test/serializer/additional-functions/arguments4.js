// does not contain:x = 5;

function additional1(argument1, argument2) {
  var z = { foo: argument1 };
  var w = { bar: argument2 };
  var x = 5;
  return [w, z];
}
if (global.__optimize) __optimize(additional1);

inspect = function inspect() {
  let z = additional1(12, 3);

  return "" + JSON.stringify(z);
};
