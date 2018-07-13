module.exports = function (api) {
  api.cache(false);
  // We don't want Jest to transform tests other than Flow
  if (process.env.NODE_ENV === "test") {
    return {
      presets: [
        "@babel/preset-flow",
      ],
    };
  }
  return {
    presets: [
      ["@babel/env", {
        "targets": {
          "node": "6.10"
        }
      }],
      "@babel/preset-flow",
    ],
    plugins: [
      ["@babel/plugin-transform-react-jsx", { "useBuiltIns": true }],
      "@babel/plugin-proposal-export-default-from",
      "@babel/plugin-proposal-class-properties",
      "@babel/plugin-proposal-object-rest-spread",
    ],
  };
};
