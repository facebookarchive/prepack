let x = global.__abstract ? __abstract("boolean", "false") : false;
let f = function() {
  return 42;
};
let initialized = false;
if (x) {
  f = undefined;
  initialized = true;
}
let result;
if (!initialized) {
  result = f();
}

inspect = function() {
  return result;
};
