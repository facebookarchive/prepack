function additional1(x) {
  return x++;
}

function additional2(x) {
  ++x;
  return x;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let x = additional1(4);
  let y = additional2(10);
  return x + y;
};
