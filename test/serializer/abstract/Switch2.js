let x = global.__abstract ? __abstract("number", "1") : 1;
var z1, z2, z3, z4, z5;
z1 = z2 = z3 = z4 = z5 = 10;

switch (x) {
  case 1:
    z1 = 11;
    break;
  case 1:
    z1 = 12;
    break;
  case 2:
    z1 = 13;
    break;
  default:
    z1 = 14;
    break;
}

switch (x) {
  case 1:
    z2 = 11;
  case 1 + 1:
    z2 += 12;
    break;
  case 2:
    z2 = 13;
    break;
  default:
    z2 = 14;
    break;
}

switch ("") {
  case "a":
    z3 = 11;
    break;
  case "" + "":
    z3 = 12;
  case "":
    z3 = 13;
    break;
  default:
    z3 = 14;
    break;
}

switch ([]) {
  case []:
    z4 = 11;
  case []:
    z4 = 12;
  case {}:
    z4 = 13;
    break;
  default:
    z4 = 14;
    break;
}

// add at runtime:function __nextComponentID() { return 1; }
let f = global.__abstract ? __abstract(":number", "__nextComponentID") : __nextComponentID;

switch (x) {
  case 1:
    z5 = 13;
  case f():
    z5 += 11;
  case f():
    z5 += 12;
  default:
    z5 = 14;
}

inspect = function() {
  return "" + z1 + z2 + z3 + z4 + z5;
};
