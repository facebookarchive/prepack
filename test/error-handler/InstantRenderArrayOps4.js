// instant render
// recover-from-errors
// expected errors:[{"location":{"start":{"line":9,"column":2},"end":{"line":11,"column":3},"source":"test/error-handler/InstantRenderArrayOps4.js"},"severity":"Warning","errorCode":"PP0044"},{"location":{"start":{"line":7,"column":12},"end":{"line":7,"column":22},"source":"test/error-handler/InstantRenderArrayOps4.js"},"severity":"Warning","errorCode":"PP0044"}]

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
