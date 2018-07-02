function checker() {
  let x = global.__abstract ? global.__abstract("number", "5") : 5;
  global.__assume && global.__assume(x !== 5);
}

inspect = () => {
  try {
    checker();
    return "Error: Assumption violated";
  } catch (err) {
    return err.message;
  }
};
