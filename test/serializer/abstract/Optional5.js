// add at runtime: let x = { items: "abc" };
let x = { items: "abc" };
let y = global.__abstractOrUndefined ? __abstractOrUndefined(x, "x") : x;

function getCollectionData(collection) {
  return {
    filter: true,
    collection: collection != null && collection.items,
  };
}

var z = getCollectionData(y);

inspect = function() {
  return JSON.stringify(z);
};
