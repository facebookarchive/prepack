// does not contain:===
(function() {
  let x = global.__abstract ? global.__abstract("boolean", "true") : true;
  let a = {};
  if (x) {
    a = 100;
  }
  let y = a === 200;

  inspect = function() {
    return y;
  };
})();
