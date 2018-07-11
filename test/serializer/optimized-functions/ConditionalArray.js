// does contain:1-2-3

function fn(a) {
  var array = a === null ? [1, 2, 3] : [4, 5, 6];

  return array.join("-");
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify({
    a: fn(null),
    b: fn(true),
  });
};
