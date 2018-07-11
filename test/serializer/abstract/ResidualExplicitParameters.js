(function() {
  let x = 42;
  let y = global.__residual_unsafe
    ? __residual_unsafe("number", function() {
        return x;
      })
    : 42; // this variant takes no further arguments
  inspect = function() {
    return y;
  };
})();
