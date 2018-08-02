var f = function(x, y) {
  if (y) Object.assign({}, x);
  else throw new Error();
};

if (global.__optimize) __optimize(f);

global.inspect = function() {
  let normalRet = f({ foo: "bar" }, true);
  let errorRet, error;
  try {
    errorRet = f({ baz: "qux" }, false);
  } catch (e) {
    error = e;
  }
  return JSON.stringify(normalRet) + " " + errorRet + " " + JSON.stringify(error);
};
