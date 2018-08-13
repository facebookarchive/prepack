let s = global.__abstract ? __abstract("string", "('foo')") : "foo";

function test(c) {
  let read = false;
  let read2 = false;
  let write = false;
  let write2 = false;
  let knownObj = {
    get foo() {
      read = true;
      return 1;
    },
    set foo(v) {
      write = true;
    },
  };
  let knownObj2 = {
    get foo() {
      read2 = true;
      return 2;
    },
    set foo(v) {
      write2 = true;
    },
  };
  let conditionalObj = c ? knownObj : knownObj2;
  conditionalObj[s] = 3;
  let value = conditionalObj[s];
  return "Value: " + value + " Touched: " + read + " " + read2 + "Written: " + write + " " + write2;
}

if (global.__optimize) {
  __optimize(test);
}

inspect = function() {
  return test(true);
};
