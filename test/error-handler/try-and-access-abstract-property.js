// abstract effects
// recover-from-errors
// expected errors: [{location: {"start":{"line":19,"column":11},"end":{"line":19,"column":15},"identifierName":"obj1","source":"test/error-handler/try-and-access-abstract-property.js"}, errorCode: "PP0021", severity: "RecoverableError", message: "Possible throw inside try/catch is not yet supported"},{location: {"start":{"line":27,"column":11},"end":{"line":27,"column":15},"identifierName":"obj2","source":"test/error-handler/try-and-access-abstract-property.js"}, errorCode: "PP0021", severity: "RecoverableError", message: "Possible throw inside try/catch is not yet supported"}]

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
  try {
    return obj1.foo;
  } catch (x) {
    return 1;
  }
}

function additional2() {
  try {
    return obj2.foo.bar;
  } finally {
    return 2;
  }
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  return JSON.stringify({ ret1, ret2 });
};
