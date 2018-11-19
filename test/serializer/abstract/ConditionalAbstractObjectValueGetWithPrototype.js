(function() {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let o1 = {};
  o1.__proto__ = { bar: 42 };
  let o2 = {};
  let o = c ? o1 : o2;
  global.foo = o.bar;
  inspect = function() {
    return global.foo;
  };
})();
