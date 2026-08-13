/**
 * Recognized Indian State/UT registration prefix codes (the first two
 * letters of a vehicle registration number, e.g. "KA" for Karnataka).
 *
 * This list is used ONLY for structural plausibility checking - i.e.
 * "does this look like a real state code" - not for confirming the
 * vehicle's actual registration, ownership, or legal status against
 * any government database.
 *
 * Source: standard published list of Indian state/UT RTO codes.
 * New/renamed union territories are included; this list is not
 * guaranteed exhaustive or perfectly current, and is intentionally
 * kept as plain data so it can be corrected/extended without touching
 * validation logic.
 */
export const INDIAN_STATE_UT_CODES = new Set([
  'AN', // Andaman and Nicobar Islands
  'AP', // Andhra Pradesh
  'AR', // Arunachal Pradesh
  'AS', // Assam
  'BR', // Bihar
  'CH', // Chandigarh
  'CG', // Chhattisgarh
  'DD', // Daman and Diu (legacy)
  'DN', // Dadra and Nagar Haveli (legacy)
  'DH', // Dadra and Nagar Haveli and Daman and Diu
  'DL', // Delhi
  'GA', // Goa
  'GJ', // Gujarat
  'HR', // Haryana
  'HP', // Himachal Pradesh
  'JK', // Jammu and Kashmir
  'JH', // Jharkhand
  'KA', // Karnataka
  'KL', // Kerala
  'LA', // Ladakh
  'LD', // Lakshadweep
  'MP', // Madhya Pradesh
  'MH', // Maharashtra
  'MN', // Manipur
  'ML', // Meghalaya
  'MZ', // Mizoram
  'NL', // Nagaland
  'OD', // Odisha (current)
  'OR', // Odisha (legacy code)
  'PY', // Puducherry
  'PB', // Punjab
  'RJ', // Rajasthan
  'SK', // Sikkim
  'TN', // Tamil Nadu
  'TS', // Telangana
  'TR', // Tripura
  'UP', // Uttar Pradesh
  'UK', // Uttarakhand
  'UA', // Uttarakhand (legacy code)
  'WB', // West Bengal
]);

export default INDIAN_STATE_UT_CODES;
