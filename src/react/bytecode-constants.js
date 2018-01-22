/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

export const Opcodes = {
  // Elements
  ELEMENT_OPEN: { value: 1, hint: "ELEMENT_OPEN" },
  ELEMENT_OPEN_DIV: { value: 2, hint: "ELEMENT_OPEN_DIV" },
  ELEMENT_OPEN_SPAN: { value: 3, hint: "ELEMENT_OPEN_SPAN" },
  ELEMENT_CLOSE: { value: 4, hint: "ELEMENT_CLOSE" },

  // Fragments
  STATIC_FRAGMENT_OPEN: { value: 5, hint: "STATIC_FRAGMENT_OPEN" },
  STATIC_FRAGMENT_CLOSE: { value: 6, hint: "STATIC_FRAGMENT_CLOSE" },
  DYNAMIC_FRAGMENT: { value: 7, hint: "DYNAMIC_FRAGMENT" },

  // Branches
  CONDITIONAL: { value: 8, hint: "CONDITIONAL" },

  // Components
  COMPONENT_INSTANCE: { value: 10, hint: "COMPONENT_INSTANCE" },
  COMPONENT_LIFECYCLE_WILL_MOUNT: { value: 11, hint: "COMPONENT_LIFECYCLE_WILL_MOUNT" },
  COMPONENT_LIFECYCLE_DID_MOUNT: { value: 12, hint: "COMPONENT_LIFECYCLE_DID_MOUNT" },
  COMPONENT_LIFECYCLE_WILL_RECEIVE_PROPS: { value: 13, hint: "COMPONENT_LIFECYCLE_WILL_RECEIVE_PROPS" },
  COMPONENT_LIFECYCLE_SHOULD_UPDATE: { value: 14, hint: "COMPONENT_LIFECYCLE_SHOULD_UPDATE" },
  COMPONENT_LIFECYCLE_WILL_UPDATE: { value: 15, hint: "COMPONENT_LIFECYCLE_WILL_UPDATE" },
  COMPONENT_LIFECYCLE_DID_UPDATE: { value: 16, hint: "COMPONENT_LIFECYCLE_DID_MOUNT" },
  COMPONENT_LIFECYCLE_WILL_UNMOUNT: { value: 17, hint: "COMPONENT_LIFECYCLE_WILL_UNMOUNT" },
  COMPONENT_LIFECYCLE_DID_CATCH: { value: 18, hint: "COMPONENT_LIFECYCLE_DID_CATCH" },

  // Properties / attributes
  ATTRIBUTE_STATIC: { value: 20, hint: "ATTRIBUTE_STATIC" },
  ATTRIBUTE_DYNAMIC: { value: 21, hint: "ATTRIBUTE_DYNAMIC" },
  PROPERTY_STATIC_CLASS_NAME: { value: 22, hint: "PROPERTY_STATIC_CLASS_NAME" },
  PROPERTY_DYNAMIC_CLASS_NAME: { value: 23, hint: "PROPERTY_DYNAMIC_CLASS_NAME" },
  PROPERTY_STATIC_ID: { value: 24, hint: "PROPERTY_STATIC_ID" },
  PROPERTY_DYNAMIC_ID: { value: 25, hint: "PROPERTY_DYNAMIC_ID" },
  PROPERTY_STATIC: { value: 26, hint: "PROPERTY_STATIC" },
  PROPERTY_DYNAMIC: { value: 27, hint: "PROPERTY_DYNAMIC" },

  // Events
  EVENT_STATIC: { value: 28, hint: "EVENT_STATIC" },
  EVENT_DYNAMIC: { value: 29, hint: "EVENT_DYNAMIC" },

  // Text
  TEXT_STATIC_CONTENT: { value: 28, hint: "TEXT_STATIC_CONTENT" },
  TEXT_DYNAMIC_CONTENT: { value: 29, hint: "TEXT_DYNAMIC_CONTENT" },
  TEXT_STATIC_NODE: { value: 30, hint: "TEXT_STATIC_NODE" },
  TEXT_DYNAMIC_NODE: { value: 31, hint: "TEXT_DYNAMIC_NODE" },

  // Unknown
  UNKNOWN_CHILDREN: { value: 36, hint: "UNKNOWN_CHILDREN" },
  UNKNOWN_NODE: { value: 37, hint: "UNKNOWN_NODE" },
};
