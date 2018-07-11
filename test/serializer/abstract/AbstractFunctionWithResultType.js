// add at runtime:function __nextComponentID() { return 42; }
(function() {
  let f = global.__abstract ? __abstract(":number", "__nextComponentID") : __nextComponentID;
  let t = typeof f();
  inspect = function() {
    return t;
  };
})();
