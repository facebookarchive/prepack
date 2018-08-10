function fn2(sholdError) {
  if (sholdError) {
    throw new Error("Error");
  }
  return {
    thisValueShouldExist: true,
  };
}

function fn(sholdError) {
  var a = Object.assign({}, fn2(sholdError));
  return a.thisValueShouldExist;
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return fn(true, false);
};
