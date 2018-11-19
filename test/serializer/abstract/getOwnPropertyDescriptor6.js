let x = global.__abstract ? __abstract("boolean", "true") : true;
let desc = Object.getOwnPropertyDescriptor(
  {
    get a() {
      return 1;
    },
  },
  "a"
);
let ob1 = {};
Object.defineProperty(ob1, "a", desc);
let ob2 = {};
Object.defineProperty(ob2, "a", desc);
let ob = x ? ob1 : ob2;
var desc2 = Object.getOwnPropertyDescriptor(ob, "a");
inspect = function() {
  return JSON.stringify(desc2);
};
