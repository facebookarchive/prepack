let b = global.__abstract ? __abstract("boolean", "true") : true;

let x;
let y = 1;
if (b) {
  x = true;
  y = false;
} else {
  x = [];
  y = null;
}

let z = 1;
if (b) {
  z = 2;
}

if (x) {
  z = 3;
}

if (y) {
  z = 4;
}

if (y) {
  z = 5;
} else {
  z = 6;
}

let __result = y + "" + z;
