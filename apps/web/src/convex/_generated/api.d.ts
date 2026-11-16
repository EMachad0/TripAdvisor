/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as content from "../content.js";
import type * as decide from "../decide.js";
import type * as e2e from "../e2e.js";
import type * as exporter from "../exporter.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_bearer from "../lib/bearer.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_logic_object from "../lib/logic/object.js";
import type * as lib_logic_route from "../lib/logic/route.js";
import type * as lib_logic_trip from "../lib/logic/trip.js";
import type * as lib_rows from "../lib/rows.js";
import type * as lib_sha256 from "../lib/sha256.js";
import type * as lib_state from "../lib/state.js";
import type * as lib_tripStore from "../lib/tripStore.js";
import type * as members from "../members.js";
import type * as ops from "../ops.js";
import type * as route from "../route.js";
import type * as tables_app from "../tables/app.js";
import type * as tables_feedback from "../tables/feedback.js";
import type * as tables_state from "../tables/state.js";
import type * as tables_trip from "../tables/trip.js";
import type * as tables_validators from "../tables/validators.js";
import type * as trip from "../trip.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  content: typeof content;
  decide: typeof decide;
  e2e: typeof e2e;
  exporter: typeof exporter;
  feedback: typeof feedback;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/bearer": typeof lib_bearer;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "lib/logic/object": typeof lib_logic_object;
  "lib/logic/route": typeof lib_logic_route;
  "lib/logic/trip": typeof lib_logic_trip;
  "lib/rows": typeof lib_rows;
  "lib/sha256": typeof lib_sha256;
  "lib/state": typeof lib_state;
  "lib/tripStore": typeof lib_tripStore;
  members: typeof members;
  ops: typeof ops;
  route: typeof route;
  "tables/app": typeof tables_app;
  "tables/feedback": typeof tables_feedback;
  "tables/state": typeof tables_state;
  "tables/trip": typeof tables_trip;
  "tables/validators": typeof tables_validators;
  trip: typeof trip;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
