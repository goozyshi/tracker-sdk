export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONArray | JSONObject;
export type JSONArray = JSONValue[];
export interface JSONObject {
  [key: string]: JSONValue;
}
