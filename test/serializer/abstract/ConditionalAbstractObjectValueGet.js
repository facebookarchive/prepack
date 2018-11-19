(function() {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let o = c ? {} : {};
  global.foo = o.bar;
  inspect = function() {
    return global.foo;
  };
})();
