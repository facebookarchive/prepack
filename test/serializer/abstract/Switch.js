// throws introspection error
let x = global.__abstract ? __abstract("number", "1") : 1;
z = 10;

switch (x) {
  case 0: z = 11; break;
  case 1: z = 12; break;
  case 2: z = 13; break;
  default: z = 14; break;
}

inspect = function() { return "" + z; }
