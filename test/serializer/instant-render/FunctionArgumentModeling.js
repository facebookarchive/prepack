// instant render
// does contain:"TypecheckOpt"
// does contain:"TypecheckNumbernumber"
// does contain:__prop_int(
// does contain:__prop_string(
// does contain:__prop_string_list(

function gen_getter(valid) {
  return function(o, k) {
    if (valid.indexOf(k) < 0) throw new Error("Wrong getter");
    return o[k];
  };
}
global.__prop_int = gen_getter(["age", "width", "height"]);
global.__prop_string = gen_getter(["name", "friendlyName"]);
global.__prop_string_list = gen_getter(["friendNames"]);
// attempt to access anything else should produce errors

(function() {
  let universe = {
    Profile: {
      kind: "object",
      jsType: "object",
      graphQLType: "ProfileData",
      properties: {
        name: {
          shape: {
            kind: "scalar",
            jsType: "string",
            graphQLType: "String",
          },
          optional: false,
        },
        friendlyName: {
          shape: {
            kind: "scalar",
            jsType: "string",
            graphQLType: "String",
          },
          optional: false,
        },
        age: {
          shape: {
            kind: "scalar",
            jsType: "integral",
            graphQLType: "Int",
          },
          optional: true,
        },
        friendNames: {
          shape: {
            kind: "array",
            jsType: "array",
            graphQLType: "[String!]",
            elementShape: {
              shape: {
                kind: "scalar",
                jsType: "string",
                graphQLType: "String",
              },
              optional: false,
            },
          },
          optional: true,
        },
      },
    },
    Props: {
      kind: "object",
      jsType: "object",
      properties: {
        userProfile: {
          shape: {
            kind: "link",
            shapeName: "Profile",
          },
          optional: false,
        },
        screenSize: {
          shape: {
            kind: "object",
            jsType: "object",
            properties: {
              width: {
                shape: {
                  kind: "link",
                  shapeName: "Size",
                },
                optional: false,
              },
              height: {
                shape: {
                  kind: "link",
                  shapeName: "Size",
                },
                optional: false,
              },
            },
          },
          optional: true,
        },
      },
    },
    Size: {
      kind: "scalar",
      jsType: "integral",
    },
  };

  let toBeOptimizedModel = {
    arguments: {
      props: "Props",
    },
    universe,
  };

  function toBeOptimized(props) {
    return [
      props.userProfile.name,
      props.userProfile.friendlyName,
      props.userProfile.friendlyName ? props.userProfile.friendlyName[0] : undefined,
      props.userProfile.age,
      props.userProfile.friendNames ? props.userProfile.friendNames[2] : undefined,
      props.screenSize ? props.screenSize.width : undefined,
      props.screenSize ? props.screenSize.height : undefined,
      "TypecheckOpt" + typeof props.screenSize,
      "TypecheckNumber" + typeof props.screenSize.width,
    ];
  }
  if (global.__optimize) {
    __optimize(toBeOptimized, JSON.stringify(toBeOptimizedModel));
  }

  global.inspect = function() {
    let props = {
      userProfile: {
        name: "A",
        friendlyName: undefined,
        age: 10,
        friendNames: ["B", "C", "D"],
      },
      screenSize: {
        width: 10,
        height: 10,
      },
    };
    return toBeOptimized(props);
  };
})();
