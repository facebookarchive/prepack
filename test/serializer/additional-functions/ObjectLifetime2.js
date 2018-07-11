// expected Warning: PP1007
(function() {
  let a = [1, 2, 3];
  let f = function() {
    let b = a;
    a = undefined;
    return b;
  };
  if (global.__optimize) __optimize(f);
  inspect = function() {
    var a1 = a;
    var a2 = f();
    return a1 === a2 && a === undefined;
  };
})();
