(function() {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let o = c
    ? {}
    : {
        get foo() {
          return 5;
        },
      };
  global.desc = Object.getOwnPropertyDescriptor(o, "foo");
  inspect = function() {
    return global.desc;
  };
})();
