let ob = global.__makePartial ? __makePartial({ x: 1 }) : { x: 1 };
if (global.__makeSimple) __makeSimple(ob);

let ob2 = {};
for (var p in ob) {
  ob2[p] = ob[p];
}

let tgt = {};
for (var p in ob) {
  tgt[p] = ob2[p];
}

inspect = function() {
  return tgt.x;
};
