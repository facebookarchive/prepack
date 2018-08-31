let c = global.__abstract ? __abstract("boolean", "(true)") : true;

let invokedSetter = false;
let obj1 = Object.create({
  set x(v) {
    invokedSetter = true;
  },
});
let obj2 = { x: 1 };

let conditionalObj = c ? obj1 : obj2;

delete conditionalObj.x;

inspect = function() {
  let hasProperty = "x" in obj2;
  return JSON.stringify({ invokedSetter, hasProperty });
};
