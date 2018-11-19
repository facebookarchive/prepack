let input = global.__abstract ? __abstract("boolean", "true") : true;

let selector = input ? "A" : "B";
let value = 1;
switch (selector) {
  case "A":
    value = 2;
    throw 123;
  case "B":
    value = 3;
    break;
}

inspect = function() {
  return value;
};
