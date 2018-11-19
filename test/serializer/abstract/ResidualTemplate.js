let x = global.__abstract ? __abstract("number", "42") : 42;
var o = global.__residual
  ? __residual(
      { x: __abstract("number") },
      function(x) {
        // Prepack doesn't (yet) partially evaluate a loop over an abstract value,
        // so putting the otherwise side-effect free loop into a __residual block
        // unblocks further processing.
        let res = 0;
        for (let i = 0; i < x; i++) res++;
        return { x: res };
      },
      x
    ).x
  : x;
inspect = function() {
  return o.x;
};
