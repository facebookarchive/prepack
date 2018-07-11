var y = global.__residual
  ? __residual("void", function() {
      // A void residual function that has some side-effect that doesn't affect the heap
      let res = 0;
    })
  : undefined;
inspect = function() {
  return y;
};
