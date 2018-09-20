// does not contain:= 5
let obj1 = global.__abstract
  ? __abstract("object", '({get foo() { return "bar"; }})')
  : {
      get foo() {
        return "bar";
      },
    };
let obj2 = global.__abstract ? __abstract("object", '({foo:{bar:"baz"}})') : { foo: { bar: "baz" } };
if (global.__makeSimple) {
  __makeSimple(obj2);
}

function additional1() {
  function foo() {
    let garbage = 5;
    return 2;
  }
  if (global.__optimize) __optimize(foo);
  global.foo = foo;
  return String(obj1.foo);
}

function additional2() {
  function bar() {
    let garbage = 5;
    return 5;
  }
  if (global.__optimize) __optimize(bar);
  global.bar = bar;
  return String(obj2.foo.bar);
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let ret2 = additional2();
  let ret1 = additional1();
  ret1 + " " + global.foo() + " " + global.bar();
  return ret1 + ret2;
};
