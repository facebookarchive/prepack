// does contain:12

function fn(source1, source2) {
  var target = {};
  var usefulStuff = {
    makeNumber() {
      return 5;
    },
  };

  var usefulStuff2 = {
    makeNumber() {
      return 7;
    },
  };
  Object.assign(target, source1, usefulStuff, source2, usefulStuff2);

  return target.makeNumber() + 5;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({}, {});
};
