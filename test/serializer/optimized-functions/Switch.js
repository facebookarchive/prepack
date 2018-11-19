function fn(arg) {
  var res = fn2(arg);
  switch (res) {
    case "a":
      return 1;
  }
}

function fn2(arg) {
  if (arg > 1) {
    return "c";
  } else if (arg > 0) {
    return "b";
  }
  return "a";
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify([fn(0), fn(1)]);
};
