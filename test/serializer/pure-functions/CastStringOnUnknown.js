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
  return String(obj1.foo);
}

function additional2() {
  return String(obj2.foo.bar);
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  return ret1 + ret2;
};
