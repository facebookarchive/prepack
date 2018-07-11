(function() {
  let a = [1, 2, 3];
  let f = function() {
    return a;
  };
  if (global.__optimize) __optimize(f);
  inspect = function() {
    return f() === f();
  };
})();
