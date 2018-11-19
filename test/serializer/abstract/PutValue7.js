// throws introspection error
let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob1 = {};
Object.defineProperty(ob1, "p", { writable: false, value: 1 });
let ob2 = {};
Object.defineProperty(ob2, "p", { writable: true, value: 2 });
global.ob = x ? ob1 : ob2;
ob.p = 3;
inspect = function() {
  return global.ob.p;
};
