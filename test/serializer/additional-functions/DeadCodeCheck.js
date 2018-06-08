// does not contain:x.thisShouldNotAppear

function fn(x) {
  var a = x.thisShouldNotAppear;

  return 10;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({});
};
