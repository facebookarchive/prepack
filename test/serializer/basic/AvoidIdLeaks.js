// Making sure we don't leak ids in global scope

inspect = function() {
  return global._0 !== undefined;
};
