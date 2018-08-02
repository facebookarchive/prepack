// throws introspection error
var obj = global.__abstract ? __abstract("object", "({ p: 41} )") : { p: 41 };
delete obj.p;
z = obj.p;

inspect = function() {
  return global.z;
};
