let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob1 = { x: 123 };
let ob2 = { y: 456 };
let ob3 = {};
let o = x ? ob1 : ob2;

delete o.x;
ob1.x = ob3.x;

z = ob1.x;

inspect = function() {
  return "" + global.z;
};
