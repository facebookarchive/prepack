// does not contain:x = 5;

function additional1(argument) {
  var z = { foo: argument };
  var x = 5;
  return z;
}

function additional2(argument) {
  var z = { bar: argument };
  var x = 5;
  return z;
}

if (global.__registerAdditionalFunctionToPrepack) {
  __registerAdditionalFunctionToPrepack(additional1);
  __registerAdditionalFunctionToPrepack(additional2);
}

inspect = function inspect() {
  let z = additional1(7);
  let z2 = additional2(42);

  return '' + JSON.stringify(z) + ' ' + JSON.stringify(z2);
}
