// Copies of slice\(:1

(function() {
  let o = global.__abstract ? __abstract("string", "('x y z')") : "x y z";
  let c = global.__abstract ? __abstract("boolean", "true") : true;
  let s = "ok";

  if (c) s = "X" + o.slice(3);
  if (c) s = "Y" + o.slice(3);

  global.s = s;
  inspect = () => s;
})();
