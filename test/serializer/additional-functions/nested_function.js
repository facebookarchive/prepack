// additional functions
// does not contain:var y = 5;
// does not contain:var y = 10;

function additional1() {
  var x2 = { foo: 5 };
  foo = function() { return x2; }
  var y = 5;
}

function produceObject() {
  return { bar: 5 };
}

function additional2() {
  let x1 = produceObject();
  bar = function() { return x1; }
}

inspect = function() {
  additional1();
  additional2();
  let bar1 = bar;
  let foo1 = foo;
  additional1();
  additional2();

  return ' ' + JSON.stringify(bar()) + foo().foo + bar1() + foo1().foo + (bar1 === bar) + (bar1() === bar()) + (foo1() === foo());
}
