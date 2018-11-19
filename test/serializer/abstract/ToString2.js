let x = global.__abstract ? global.__abstract("string", "('xxxx')") : "xxxx";
let y = global.__abstract ? global.__abstract("number", "(3)") : 3;
let ob = { toString: () => x };
let ob2 = { toString: () => x, valueOf: () => y };
var str = "aaa" + ob;
var num = 123 + ob2;

inspect = function() {
  return str + num;
};
