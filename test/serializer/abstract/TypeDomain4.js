// does not contain:typeof
(function() {
  let a = global.__makeSimple ? global.__makeSimple(__abstract({}, "{}")) : {};
  let b = global.__abstract ? global.__abstract("number", "100") : 100;
  let x = a.x === b;
  let y = typeof x;

  inspect = function() {
    return y;
  };
})();
