// instant render
// expected errors:[{"location":{"start":{"line":8,"column":2},"end":{"line":10,"column":3},"source":"test/error-handler/InstantRenderArrayOps3.js"},"severity":"RecoverableError","errorCode":"PP0039"}]

function f(c) {
  var arr = Array.from(c);
  let x = 1;

  function op(x) {
    return x + 41;
  }

  let mapped = arr.map(op);
  x = 2;
  let mapped2 = mapped.map(op);

  return mapped2;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
