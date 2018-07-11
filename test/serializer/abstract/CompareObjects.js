(function() {
  var x = global.__abstract ? __abstract("object", "({})") : {};
  var c = x === global;
  inspect = function() {
    return c;
  };
})();
