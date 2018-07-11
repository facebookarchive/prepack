// Copies of value = 42:1
let input = global.__abstract ? __abstract("boolean", "true") : true;

let selector = input ? "A" : "B";
let value = input ? 21 : 23;
switch (selector) {
  case "A":
    value = value * 2;
    break;
  case "B":
    value = value + 19;
    break;
}

inspect = function() {
  return value;
};
