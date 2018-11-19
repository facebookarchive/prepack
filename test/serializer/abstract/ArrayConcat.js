// add at runtime:function __nextComponentID() { return 42; }
(function() {
  let f = global.__abstract ? __abstract(":number", "__nextComponentID") : __nextComponentID;
  let n = f();
  let a = [].concat([n]);

  inspect = function() {
    return a[0];
  };
})();
