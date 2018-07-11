let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob = {};
if (x) {
  Object.defineProperty(ob, "x", { configurable: true, get: () => 2 });
} else {
  ob.x = 123;
}
if (!x) {
} else {
  Object.defineProperty(ob, "y", { configurable: true, get: () => 3 });
}

let ob2 = { y: 2 };
if (!x) {
  Object.defineProperty(ob2, "x", {
    configurable: true,
    get: () => this._x,
    set: v => {
      this._x = v;
    },
  });
} else {
  ob2.x = 123;
}
ob2.x = 456;

let ob3 = {};
if (x) {
  Object.defineProperty(ob3, "x", {
    configurable: true,
    get: () => this._x,
    set: v => {
      throw v;
    },
  });
} else {
  ob3.x = 123;
}
try {
  ob3.x = 789;
} catch (e) {
  ob3.e = e;
}

let ob4 = {};
if (x) {
  Object.defineProperty(ob4, "x", { configurable: true, get: () => 4 });
} else {
  Object.defineProperty(ob4, "x", { configurable: false, get: () => 5 });
}

let ob5 = {};
if (x) {
  Object.defineProperty(ob5, "x", {
    configurable: true,
    get: () => {
      throw 4;
    },
  });
} else {
  Object.defineProperty(ob5, "x", { configurable: false, get: () => 5 });
}
var z;
try {
  z = ob5.x;
} catch (e) {
  z = "caught " + e;
}

inspect = function() {
  return ob.x + " " + ob.y + " " + ob2.x + " " + ob3.x + " " + ob3.e + " " + z;
};
