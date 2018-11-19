function checker() {
  let x = global.__abstract ? global.__abstract("number", "5") : 5;
  global.__assume && global.__assume(x !== 5, "x should not be 5");
}

inspect = () => {
  try {
    checker();
    return "x should not be 5";
  } catch (err) {
    return err;
  }
};
