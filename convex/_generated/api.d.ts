/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auditLogs from "../auditLogs.js";
import type * as checkCompletion from "../checkCompletion.js";
import type * as checkEmail from "../checkEmail.js";
import type * as checkReplies from "../checkReplies.js";
import type * as checkScheduling from "../checkScheduling.js";
import type * as crons from "../crons.js";
import type * as gmailSync from "../gmailSync.js";
import type * as holidays from "../holidays.js";
import type * as lib_addressNormalizer from "../lib/addressNormalizer.js";
import type * as lib_businessDays from "../lib/businessDays.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_holidayData from "../lib/holidayData.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_retry from "../lib/retry.js";
import type * as lib_templates from "../lib/templates.js";
import type * as lib_types from "../lib/types.js";
import type * as processedMessages from "../processedMessages.js";
import type * as services_airtableScraper from "../services/airtableScraper.js";
import type * as services_emailParser from "../services/emailParser.js";
import type * as services_gmail from "../services/gmail.js";
import type * as services_googleChat from "../services/googleChat.js";
import type * as services_googleDrive from "../services/googleDrive.js";
import type * as services_googleSheets from "../services/googleSheets.js";
import type * as services_replyParser from "../services/replyParser.js";
import type * as sites from "../sites.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auditLogs: typeof auditLogs;
  checkCompletion: typeof checkCompletion;
  checkEmail: typeof checkEmail;
  checkReplies: typeof checkReplies;
  checkScheduling: typeof checkScheduling;
  crons: typeof crons;
  gmailSync: typeof gmailSync;
  holidays: typeof holidays;
  "lib/addressNormalizer": typeof lib_addressNormalizer;
  "lib/businessDays": typeof lib_businessDays;
  "lib/constants": typeof lib_constants;
  "lib/holidayData": typeof lib_holidayData;
  "lib/logger": typeof lib_logger;
  "lib/retry": typeof lib_retry;
  "lib/templates": typeof lib_templates;
  "lib/types": typeof lib_types;
  processedMessages: typeof processedMessages;
  "services/airtableScraper": typeof services_airtableScraper;
  "services/emailParser": typeof services_emailParser;
  "services/gmail": typeof services_gmail;
  "services/googleChat": typeof services_googleChat;
  "services/googleDrive": typeof services_googleDrive;
  "services/googleSheets": typeof services_googleSheets;
  "services/replyParser": typeof services_replyParser;
  sites: typeof sites;
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

export declare const components: {};
