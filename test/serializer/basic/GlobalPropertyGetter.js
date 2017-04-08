Object.defineProperty(global, "p", { 
  configurable: true, 
  enumerable: true, 
  get: function () { throw new Error("42"); }
});

inspect = function() { 
  try {
    return p; 
  } catch(e) {
    return e.message;
  }
}