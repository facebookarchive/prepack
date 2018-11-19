let x = global.__abstract ? __abstract("boolean", "false") : false;
let f = function() {
  return 42;
};
let modules = [];
if (x) {
  modules[0] = { initialized: true, f: undefined, result: f() };
} else {
  modules[0] = { initialized: false, f, result: undefined };
}
let module = modules[0];
if (module && module.initialized) {
} else if (module) {
  // (!module || !x)
  modules[0] = { initialized: true, f: undefined, result: module.f() };
}

inspect = function() {
  return modules[0].result;
};
