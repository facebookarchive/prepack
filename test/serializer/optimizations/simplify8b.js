// does not contain: bar
let a = global.__abstract ? __abstract("boolean", "(true)") : true;
let ob = a ? null : { bar: 1 };
let nob = !ob && "not an object";

inspect = function() {
  return nob;
};
