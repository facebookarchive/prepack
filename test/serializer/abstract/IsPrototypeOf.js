// throws introspection error

let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = global.__makePartial ? __makeSimple(__makePartial({})) : {};

let p = x ? {} : ob.p;

y = Object.prototype.isPrototypeOf(p);

inspect = function() {
  return "" + y;
};
