var x = global.__abstract ? (x = __abstract("number", "(3)")) : 3;

function func1() {
  for (let i = 0; i < 10; i++) {
    if (i === x) {
      break;
    }
    if (i === 4) {
      throw new Error("X is 4");
    }
  }
}

if (global.__optimize) __optimize(func1);
