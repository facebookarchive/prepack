function additional1(obj) {
  var tmp = { x: obj.x };
  tmp.x++;
  return tmp;
}

function additional2(obj) {
  var v = obj.x;
  var tmp = { x: v };
  ++tmp.x;
  tmp.y = v;
  return tmp;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  var obj = { x: 4 };
  let o1 = additional1(obj);
  let o2 = additional2(obj);
  return JSON.stringify({ obj, o1, o2 });
};
