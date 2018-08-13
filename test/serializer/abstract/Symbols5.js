(function() {
  let x = global.__abstract ? __abstract("symbol", "(Symbol())") : Symbol();
  let y;
  try {
    y = +x;
  } catch (e) {
    y = e instanceof TypeError;
  }
  inspect = function() {
    return y;
  };
})();
