(function() {
  var a = {};
  var c = global.__abstract ? __abstract("boolean", "true") : "c";
  if (c) {
    a.foo = 42;
    global.a = a;
  }
  inspect = function() {
    return global.a.foo;
  };
})();
