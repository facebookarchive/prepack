let ob = global.__makePartial ? __makePartial({ x: 1 }) : { x: 1 };
let ob2 = global.__makePartial ? __makePartial({ x: 2 }) : { x: 2 };
if (global.__makeSimple) __makeSimple(ob);
if (global.__makeSimple) __makeSimple(ob2);

let tgt = {};
for (var p in ob) {
  tgt[p] = ob2[p];
}

inspect = function() {
  return tgt.x;
};
