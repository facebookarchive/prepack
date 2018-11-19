// throws introspection error

let obj = global.__abstract ? __abstract("object", "({x:1,y:3})") : { x: 1, y: 3 };
if (global.__makeSimple) global.__makeSimple(obj);
let y = 2;
with (obj) {
  z = x + y;
}
inspect = function() {
  return z;
};
