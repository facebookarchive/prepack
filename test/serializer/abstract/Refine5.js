let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { y: "z" } : undefined;
var z = ob != undefined && ob;
var z1 = ob != undefined || x || ob;

inspect = function() {
  return z.y + z1;
};
