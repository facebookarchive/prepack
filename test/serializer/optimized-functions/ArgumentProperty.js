function fn(arg) {
  if (arg !== null) {
    if (arg.foo) {
      return 42;
    }
  }
}

if (global.__optimize) {
  __optimize(fn);
}

inspect = function() {
  return JSON.stringify([fn(null), fn({}), fn({ foo: true })]);
};
