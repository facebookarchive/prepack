let x = global.__abstract ? __abstract("number", "1") : 1;
global.z1 = global.z2 = global.z3 = global.z4 = global.z5 = global.z6 = global.z7 = global.z8 = global.z9 = global.z10 = global.z11 = 10;

switch (x) {
}

switch (x) {
  case 0:
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
  case 2:
    z2 = 11;
    break;
  case 1:
    z2 = 12;
    break;
  case 0:
    z2 = 13;
    break;
  default:
    z2 = 14;
    break;
}

switch (x + 1) {
  case 0:
    z3 = 11;
    break;
  case 1:
    z3 = 100;
    break;
  case 2:
    z3 = 12;
  case 3:
    z3 = 14;
  default:
    z3 = 122;
    break;
}

switch (x) {
  case x - 1:
    z5 = 11;
    break;
  case x:
    z5 = 12;
    break;
}

switch (x) {
  case 5:
    z6 = 100;
    break;
  case 6:
    z6 = 101;
    break;
}

switch (x) {
  case 5:
    z7 = 100;
    break;
  case 6:
    z7 = 101;
    break;
  default:
    z7 = 12;
    break;
}

switch (x) {
  case 5:
    z8 = 100;
    break;
  default:
    z8 = 12;
    break;
  case 6:
    z8 = 101;
    break;
}

switch (x) {
  case 5:
    z9 = 100;
    break;
  default:
    z9 = 12;
  case 6:
    z9 = 101;
    break;
}

switch (x) {
  case 0:
    throw 1;
  case 1:
    z10 = 12;
    break;
  case 2:
    z10 = 13;
    break;
  default:
    throw 2;
}

switch (x) {
  case 1:
    if (z10 === 13) z11 = 12;
    else throw 3;
    break;
  case 0:
    throw 1;
    break;
  case 2:
    z11 = 13;
    break;
  default:
    throw 2;
    break;
}

inspect = function() {
  return (
    "" +
    global.z1 +
    " " +
    global.z2 +
    " " +
    global.z3 +
    " " +
    global.z4 +
    " " +
    global.z5 +
    " " +
    global.z6 +
    " " +
    global.z7 +
    " " +
    global.z8 +
    " " +
    global.z9 +
    " " +
    global.z10 +
    " " +
    global.z11
  );
};
