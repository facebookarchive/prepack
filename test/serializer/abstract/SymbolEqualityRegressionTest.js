// add at runtime:var c=false;var description="whatever";
(function() {
  let c = global.__abstract ? __abstract("boolean", "c") : false;
  let description = global.__abstract ? __abstract("string", "description") : "whatever";
  let s = Symbol(description);
  let t = Symbol(description);
  let u = c ? s : t;
  let bug = s === u;
  inspect = function() {
    return bug;
  };
})();
