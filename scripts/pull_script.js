// model/pattern.ts
var isObject = (pattern) => typeof pattern == "object" && pattern != null && !Array.isArray(pattern);
var isRefPattern = (pattern) => isObject(pattern) && ("$ref" in pattern) && typeof pattern.$ref == "string";
var isDefsPattern = (pattern) => isObject(pattern) && ("$defs" in pattern) && isObject(pattern.$defs) && ("pattern" in pattern);
var hasStringId = (pattern) => isObject(pattern) && typeof pattern.$id == "string";
var isKeywordKey = (key) => key.startsWith("$") && !key.startsWith("$$");
var literalKey = (key) => key.startsWith("$$") ? key.slice(1) : key;
var propKey = (key) => {
  key = literalKey(key);
  return { key: key.endsWith("?") ? key.slice(0, -1) : key, optional: key.endsWith("?") };
};
var normalProps = (pattern) => Object.entries(pattern).filter(([k]) => k != "[key:string]" && !isKeywordKey(k)).map(([k, pattern2]) => ({ ...propKey(k), pattern: pattern2 }));
var toSchema = (pattern) => {
  const _toSchema = (pattern2) => {
    if (typeof pattern2 == "object" && pattern2 != null && "$any" in pattern2)
      return {};
    if (pattern2 == String)
      return { type: "string" };
    if (pattern2 == Number)
      return { type: "number" };
    if (pattern2 == Boolean)
      return { type: "boolean" };
    if (typeof pattern2 == "string" || typeof pattern2 == "number" || typeof pattern2 == "boolean" || pattern2 === null)
      return { const: pattern2 };
    if (pattern2 instanceof Array && pattern2.length == 1)
      return { type: "array", items: _toSchema(pattern2[0]) };
    if (pattern2 instanceof Array)
      return { anyOf: pattern2.map(_toSchema) };
    if (isObject(pattern2)) {
      if (pattern2 == null)
        return { type: "null" };
      if ("$const" in pattern2)
        return { const: pattern2["$const"] };
      if (isRefPattern(pattern2))
        return pattern2;
      let props = {};
      let required = [];
      let additionalProperties = undefined;
      Object.entries(pattern2).forEach(([k, v]) => {
        if (k == "[key:string]")
          additionalProperties = _toSchema(v);
      });
      normalProps(pattern2).forEach((prop) => {
        if (!prop.optional)
          required.push(prop.key);
        props[prop.key] = _toSchema(prop.pattern);
      });
      let res = { type: "object" };
      if (Object.keys(props).length > 0)
        res.properties = props;
      if (required.length > 0)
        res.required = required;
      if (hasStringId(pattern2))
        res.$id = pattern2.$id;
      if (additionalProperties)
        res.additionalProperties = additionalProperties;
      return res;
    }
    throw new Error("Invalid pattern: " + String(pattern2));
  };
  if (isDefsPattern(pattern)) {
    return {
      $defs: Object.fromEntries(Object.entries(pattern.$defs).map(([k, v]) => [k, _toSchema(v)])),
      ..._toSchema(pattern.pattern)
    };
  }
  return _toSchema(pattern);
};

// scripts/pull_script.ts
console.log(toSchema(String));
console.error("Pull script not implemented yet, exiting.");
