let a = 1 << 1;
let b = 1 >> 1;
let c = 1 >>> 1;
let d = 1 + 1;
let e = 1 - 1;
let f = 1 & 1;
let g = 1 | 1;
let h = 1 ^ 1;
let i = +a;
let j = -a;
let k = ~a;
let l = a++;
let m = ++a;
let n = a--;
let o = --a;
let p = 1;
let z = a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p;

let na = 1.1;
let nb = 1.1 + 1;
let nc = 1.1 - 1;
let nd = +na;
let ne = -nb;
let nf = na++;
let ng = na--;
let nh = ++na;
let ni = na++;

if (global.__isIntegral) {
  if (!__isIntegral(a)) throw new Error("bug!");
  if (!__isIntegral(b)) throw new Error("bug!");
  if (!__isIntegral(c)) throw new Error("bug!");
  if (!__isIntegral(d)) throw new Error("bug!");
  if (!__isIntegral(e)) throw new Error("bug!");
  if (!__isIntegral(f)) throw new Error("bug!");
  if (!__isIntegral(g)) throw new Error("bug!");
  if (!__isIntegral(h)) throw new Error("bug!");
  if (!__isIntegral(i)) throw new Error("bug!");
  if (!__isIntegral(l)) throw new Error("bug!");
  if (!__isIntegral(m)) throw new Error("bug!");
  if (!__isIntegral(n)) throw new Error("bug!");
  if (!__isIntegral(o)) throw new Error("bug!");
  if (!__isIntegral(p)) throw new Error("bug!");
  if (!__isIntegral(z)) throw new Error("bug!");

  if (__isIntegral(na)) throw new Error("bug!");
  if (__isIntegral(nb)) throw new Error("bug!");
  if (__isIntegral(nc)) throw new Error("bug!");
  if (__isIntegral(nd)) throw new Error("bug!");
  if (__isIntegral(ne)) throw new Error("bug!");
  if (__isIntegral(nf)) throw new Error("bug!");
  if (__isIntegral(ng)) throw new Error("bug!");
  if (__isIntegral(nh)) throw new Error("bug!");
  if (__isIntegral(ni)) throw new Error("bug!");
}

inspect = function() {
  return z;
};
