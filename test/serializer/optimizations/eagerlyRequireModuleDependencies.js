let c = 0;
function __d(f, id, deps) {}
function __r(id) {
  __d(function() {}, id, id === 0 ? [1] : []);
  c++;
}
if (global.__abstract) {
  // prepacking
  global.__eagerlyRequireModuleDependencies(() => {
    __r(0);
  });
} else {
  c = 2;
}
inspect = function() {
  return c;
};
