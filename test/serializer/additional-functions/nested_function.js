// does not contain:var y = 5;
// does not contain:var y = 10;

function additional1() {
  var x2 = { foo: 5 };
  foo = function() {
    return x2;
  };
  var y = 5;
}

function produceObject() {
  return { bar: 5 };
}

function additional2() {
  "use strict";
  let x1 = produceObject();
  global.bar = function() {
    return x1;
  };
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional1();
  additional2();
  let bar1 = global.bar;
  let foo1 = global.foo;
  additional1();
  additional2();

  return (
    " " +
    JSON.stringify(global.bar()) +
    global.foo().foo +
    bar1() +
    foo1().foo +
    (bar1 === global.bar) +
    (bar1() === global.bar()) +
    (foo1() === global.foo())
  );
};
