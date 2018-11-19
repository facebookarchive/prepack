let desc = Object.getOwnPropertyDescriptor(Map.prototype, "size");
inspect = function() {
  return JSON.stringify(desc);
};
