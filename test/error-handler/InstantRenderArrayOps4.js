// instant render
// expected errors:[{"location":{"start":{"line":15,"column":12},"end":{"line":15,"column":13},"source":"test/error-handler/InstantRenderArrayOps4.js"},"severity":"RecoverableError","errorCode":"PP0039"}]

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 1 };

  function op(x) {
    return obj;
  }

  let mapped = arr.map(op);
  let val = arr[0].foo;
  let ret = mapped[0].foo;
  obj.foo = 2; // Not allowed - requires materialization via mutations

  return ret;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
