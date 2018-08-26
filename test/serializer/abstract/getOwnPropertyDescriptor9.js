let x = global.__abstract ? __abstract("boolean", "true") : true;
let nonEnumerableA = { a: 1 };
Object.defineProperty(nonEnumerableA, "a", { enumerable: false });
let ob = x ? nonEnumerableA : { a: 2 };
let desc = Object.getOwnPropertyDescriptor(ob, "a");
inspect = function() {
  return desc;
};
