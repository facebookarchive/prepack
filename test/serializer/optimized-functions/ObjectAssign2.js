// does contain:10

function fn(source1) {
  var target = {};
  var usefulStuff = {
    makeNumber() {
      return 5;
    },
  };
  Object.assign(target, source1, usefulStuff);

  return target.makeNumber() + 5;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({});
};
