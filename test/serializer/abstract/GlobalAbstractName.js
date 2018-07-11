// does not contain:global
(function() {
  global.x = 42;
  var y = global.__abstract ? __abstract("number", "global.x") : 42;
  inspect = function() {
    return y;
  };
})();
