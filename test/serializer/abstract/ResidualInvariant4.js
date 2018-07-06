function checker() {
  let x = 5;
  global.__assume(x !== 5);
}

inspect = function() {
  let unsat;

  try {
    if (global.__optimize) {
      global.__optimize(checker);
    } else {
      unsat = true;
    }
  } catch (err) {
    unsat = err.message === "Assumed condition cannot be true";
  }

  return true;
};
