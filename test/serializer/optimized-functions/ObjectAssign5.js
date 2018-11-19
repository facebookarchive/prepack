// does not contain:12

function fn(source1, source2, someAbstract) {
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
  someAbstract(usefulStuff2);
  Object.assign(target, source1, undefined, usefulStuff, null, source2, usefulStuff2);

  return target.makeNumber() + 5;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({}, {}, function() {});
};
