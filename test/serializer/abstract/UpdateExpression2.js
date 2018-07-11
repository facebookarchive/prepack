let x = global.__abstract ? global.__abstract("number", "42") : 42;
let obj = { x: x };
let arr = [x, { obj: obj }];
let y = obj.x++;
y = ++arr[0];
let z = y;
Object.defineProperty(obj, "z", {
  get() {
    return y;
  },
  set(value) {
    z += value;
  },
});
y -= arr[1].obj.z++;
inspect = function() {
  return "" + obj.x + y + arr[0] + z + obj.z;
};
