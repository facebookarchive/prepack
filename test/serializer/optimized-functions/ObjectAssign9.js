function fn2(shouldError) {
  if (shouldError) {
    throw new Error("Error");
  }
  return {
    thisValueShouldExist: true,
  };
}

function fn(shouldError) {
  var a = Object.assign({}, fn2(shouldError));
  return a.thisValueShouldExist;
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(false);
};
