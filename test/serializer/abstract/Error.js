// does not contain:setPrototypeOf
// throws introspection error
let x = global.__abstract ? __abstract("string", "('abc')") : "abc";
let err1 = new Error(x);
err1.name = x;
let err2 = new Error(err1);

inspect = function() {
  return "" + err2;
};
