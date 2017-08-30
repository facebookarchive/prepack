// additional functions
// does not contain:var y = 5;
// does not contain:var y = 10;

function additional1() {
  var x2 = { foo: 5 };
  global.foo = function() { return x2; }
  var y = 5;
}

function produceObject() {
  return { bar: 5 };
}

function additional2() {
  let x1 = produceObject();
  global.bar = function() { return x1; }
}

inspect = function() {
  additional1();
  additional2();

  return ' ' + global.bar() + global.foo().foo;
}
