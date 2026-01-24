/**
 * Refine Data Provider with Authentication
 *
 * Creates a data provider that uses the authenticated API client.
 * All requests will automatically include the Bearer token.
 */
import dataProvider from "@refinedev/simple-rest";
import { apiClient } from "./apiClient";
import { API_URL } from "../config";

/**
 * Authenticated data provider for Refine.
 * Uses apiClient which automatically attaches Bearer tokens.
 */
export const authenticatedDataProvider = dataProvider(API_URL, apiClient);

export default authenticatedDataProvider;
